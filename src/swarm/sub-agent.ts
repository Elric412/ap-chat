/**
 * S05 + S09 — SubAgent. Owns isolated context, runs one task via runAgentLLM,
 * and can request a child via the orchestrator (depth check enforced).
 *
 * INVARIANT: this file MUST NOT import any other sub-agent file. All
 * inter-agent communication routes through the orchestrator/message-bus.
 */
import type { StreamMessage } from '../adapters/types';
import type {
  ISubAgent,
  AgentRuntime,
  AgentOutput,
  AgentSpec,
  SpawnedChild,
} from '../types/swarm/agent';
import { MAX_AGENT_DEPTH, EMPTY_TOKEN_USAGE } from '../types/swarm/agent';
import type { TaskId, AgentId, Result } from '../types/swarm/ids';
import { Ok, Err } from '../types/swarm/ids';
import type { SwarmError } from '../types/swarm/errors';
import type { TokenUsage } from '../types/adapters';
import { runAgentLLM } from './agent-llm';

export interface SpawnHook {
  /** Orchestrator-provided callback. Returns the spawned child metadata or an error. */
  (parentAgentId: AgentId, parentTaskId: TaskId, instruction: string): Promise<Result<SpawnedChild, SwarmError>>;
}

/**
 * Delegation contract. A sub-agent requests one child by emitting a sentinel
 * block on its own line:  <<<SPAWN>>> child sub-task <<<END_SPAWN>>>
 *
 * This is far more reliable than asking the model to emit a bare top-level JSON
 * object (which fights the "answer directly" instruction). We still tolerate the
 * legacy `{"spawnInstruction":"..."}` JSON form for backward compatibility.
 */
export const SPAWN_TAG_OPEN = '<<<SPAWN>>>';
export const SPAWN_TAG_CLOSE = '<<<END_SPAWN>>>';

export interface SubAgentInit {
  spec: AgentSpec;
  taskId: TaskId;
  parentAgentId: AgentId | null;
  depth: number;
  /** Optional system message overrides (e.g. recalled memory prepended). */
  primingMessages?: StreamMessage[];
  /** The user-facing instruction this agent must answer. */
  instruction: string;
  /** Optional context from completed dependency tasks. */
  dependencyContext?: string;
  /** Orchestrator callback for spawn requests. */
  spawnHook: SpawnHook;
}

interface SpawnDirective {
  spawnInstruction: string;
}

export class SubAgent implements ISubAgent {
  readonly runtime: AgentRuntime;
  private readonly spawnHook: SpawnHook;
  private aborter = new AbortController();
  private linkedSignal: AbortSignal | null = null;

  constructor(init: SubAgentInit) {
    const ctx: StreamMessage[] = [];
    if (init.spec.systemPrompt) {
      ctx.push({ role: 'system', content: [{ type: 'text', text: init.spec.systemPrompt }] });
    }
    if (init.primingMessages) ctx.push(...init.primingMessages);
    const userText = init.dependencyContext
      ? `Context from prior sub-tasks:\n${init.dependencyContext}\n\nYour instruction:\n${init.instruction}`
      : init.instruction;
    ctx.push({ role: 'user', content: [{ type: 'text', text: userText }] });

    this.runtime = {
      spec: init.spec,
      taskId: init.taskId,
      parentAgentId: init.parentAgentId,
      depth: init.depth,
      status: 'idle',
      contextMessages: ctx,
      tokenUsage: { ...EMPTY_TOKEN_USAGE },
      childAgentIds: [],
      startedAt: null,
      finishedAt: null,
    };
    this.spawnHook = init.spawnHook;
  }

  async run(signal: AbortSignal): Promise<Result<AgentOutput, SwarmError>> {
    this.linkedSignal = signal;
    const combo = new AbortController();
    const onAbort = () => combo.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    this.aborter.signal.addEventListener('abort', onAbort, { once: true });

    this.runtime.status = 'thinking';
    this.runtime.startedAt = Date.now();

    try {
      const firstPass = await this.invokeLLM(combo.signal);
      if (!firstPass.ok) {
        this.runtime.status = firstPass.error.kind === 'aborted' ? 'cancelled' : 'failed';
        return Err(firstPass.error);
      }

      let usage = mergeUsage(this.runtime.tokenUsage, firstPass.value.tokenUsage);
      let finalText = firstPass.value.text;

      const spawnDirective = parseSpawnDirective(firstPass.value.text);
      if (spawnDirective) {
        const child = await this.spawnChild(spawnDirective.spawnInstruction);
        if (!child.ok) {
          this.runtime.finishedAt = Date.now();
          this.runtime.status = child.error.kind === 'aborted' ? 'cancelled' : 'failed';
          return Err(child.error);
        }

        this.runtime.contextMessages.push({
          role: 'assistant',
          content: [{ type: 'text', text: `I delegated a child sub-task: ${spawnDirective.spawnInstruction}` }],
        });
        this.runtime.contextMessages.push({
          role: 'system',
          content: [{
            type: 'text',
            text: `Child sub-agent result for shared swarm context:\n${child.value.output}\n\nUse it if helpful, then answer the original instruction directly. Do not emit another spawn directive unless it is absolutely necessary.`,
          }],
        });
        this.runtime.contextMessages.push({
          role: 'user',
          content: [{
            type: 'text',
            text: `Incorporate the child result above and now answer your original instruction directly for the orchestrator.`,
          }],
        });

        const secondPass = await this.invokeLLM(combo.signal);
        if (!secondPass.ok) {
          this.runtime.finishedAt = Date.now();
          this.runtime.status = secondPass.error.kind === 'aborted' ? 'cancelled' : 'failed';
          return Err(secondPass.error);
        }

        usage = mergeUsage(usage, secondPass.value.tokenUsage);
        finalText = secondPass.value.text;
      }

      this.runtime.tokenUsage = usage;
      this.runtime.finishedAt = Date.now();
      this.runtime.status = 'done';

      const output: AgentOutput = {
        taskId: this.runtime.taskId,
        agentId: this.runtime.spec.id,
        text: stripSpawnDirective(finalText),
        tokenUsage: usage,
        toolResults: [],
        citations: [],
      };
      return Ok(output);
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }

  async spawnChild(instruction: string): Promise<Result<SpawnedChild, SwarmError>> {
    if (this.runtime.depth + 1 > MAX_AGENT_DEPTH) {
      return Err({ kind: 'max_depth', depth: this.runtime.depth + 1, limit: 3 });
    }
    this.runtime.status = 'awaiting_child';
    const result = await this.spawnHook(this.runtime.spec.id, this.runtime.taskId, instruction);
    if (result.ok) this.runtime.childAgentIds.push(result.value.agentId);
    this.runtime.status = 'thinking';
    return result;
  }

  cancel(): void {
    this.aborter.abort();
    this.runtime.status = 'cancelled';
  }

  private invokeLLM(signal: AbortSignal): Promise<Result<AgentOutputLike, SwarmError>> {
    return runAgentLLM({
      provider: this.runtime.spec.provider,
      model: this.runtime.spec.model,
      parameters: this.runtime.spec.parameters,
      messages: this.runtime.contextMessages,
      signal,
    });
  }
}

interface AgentOutputLike {
  text: string;
  tokenUsage: TokenUsage;
}

function mergeUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    thinkingTokens: a.thinkingTokens + b.thinkingTokens,
    cachedTokens: a.cachedTokens + b.cachedTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

const SPAWN_TAG_RE = new RegExp(
  `${escapeRegExp(SPAWN_TAG_OPEN)}([\\s\\S]*?)${escapeRegExp(SPAWN_TAG_CLOSE)}`,
  'i',
);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Tolerant spawn-directive parser. Supports two forms:
 *  1. Sentinel block:  <<<SPAWN>>> instruction <<<END_SPAWN>>>  (preferred)
 *  2. Legacy bare JSON: {"spawnInstruction":"..."}              (backward compat)
 *
 * Exported for unit testing.
 */
export function parseSpawnDirective(text: string): SpawnDirective | null {
  // Form 1: sentinel tags anywhere in the output.
  const tagMatch = text.match(SPAWN_TAG_RE);
  if (tagMatch) {
    const instruction = tagMatch[1].trim();
    if (instruction.length > 0) return { spawnInstruction: instruction };
  }

  // Form 2: legacy top-level JSON (optionally inside a ```json fence).
  const trimmed = stripFence(text).trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (
        parsed
        && typeof parsed === 'object'
        && 'spawnInstruction' in parsed
        && typeof (parsed as { spawnInstruction: unknown }).spawnInstruction === 'string'
        && (parsed as { spawnInstruction: string }).spawnInstruction.trim().length > 0
      ) {
        return { spawnInstruction: (parsed as { spawnInstruction: string }).spawnInstruction.trim() };
      }
    } catch {
      /* fall through */
    }
  }

  return null;
}

function stripFence(text: string): string {
  const fence = text.trim().match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fence ? fence[1] : text;
}

/** Remove any residual spawn directive from a final answer before returning it. */
function stripSpawnDirective(text: string): string {
  return text.replace(SPAWN_TAG_RE, '').trim();
}

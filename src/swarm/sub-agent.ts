/**
 * S05 + S09 — SubAgent. Owns isolated context, runs one task via runAgentLLM,
 * and can request a child via the orchestrator (depth check enforced).
 *
 * INVARIANT: this file MUST NOT import any other sub-agent file. All
 * inter-agent communication routes through the orchestrator/message-bus.
 */
import type { StreamMessage } from '../adapters/types';
import type { ISubAgent, AgentRuntime, AgentOutput, AgentSpec } from '../types/swarm/agent';
import { MAX_AGENT_DEPTH, EMPTY_TOKEN_USAGE } from '../types/swarm/agent';
import type { TaskId, AgentId, Result } from '../types/swarm/ids';
import { Ok, Err } from '../types/swarm/ids';
import type { SwarmError } from '../types/swarm/errors';
import type { TokenUsage } from '../types/adapters';
import { runAgentLLM } from './agent-llm';

export interface SpawnHook {
  /** Orchestrator-provided callback. Returns the new child's AgentId or an error. */
  (parentAgentId: AgentId, parentTaskId: TaskId, instruction: string): Promise<Result<AgentId, SwarmError>>;
}

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
    // Combine external + internal aborter.
    const combo = new AbortController();
    const onAbort = () => combo.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    this.aborter.signal.addEventListener('abort', onAbort, { once: true });

    this.runtime.status = 'thinking';
    this.runtime.startedAt = Date.now();

    const llm = await runAgentLLM({
      provider: this.runtime.spec.provider,
      model: this.runtime.spec.model,
      parameters: this.runtime.spec.parameters,
      messages: this.runtime.contextMessages,
      signal: combo.signal,
    });

    this.runtime.finishedAt = Date.now();
    signal.removeEventListener('abort', onAbort);

    if (!llm.ok) {
      this.runtime.status = llm.error.kind === 'aborted' ? 'cancelled' : 'failed';
      return Err(llm.error);
    }

    this.runtime.tokenUsage = mergeUsage(this.runtime.tokenUsage, llm.value.tokenUsage);
    this.runtime.status = 'done';

    const output: AgentOutput = {
      taskId: this.runtime.taskId,
      agentId: this.runtime.spec.id,
      text: llm.value.text,
      tokenUsage: llm.value.tokenUsage,
      toolResults: [],
      citations: [],
    };
    return Ok(output);
  }

  async spawnChild(instruction: string): Promise<Result<AgentId, SwarmError>> {
    if (this.runtime.depth + 1 > MAX_AGENT_DEPTH) {
      return Err({ kind: 'max_depth', depth: this.runtime.depth + 1, limit: 3 });
    }
    this.runtime.status = 'awaiting_child';
    const result = await this.spawnHook(this.runtime.spec.id, this.runtime.taskId, instruction);
    if (result.ok) this.runtime.childAgentIds.push(result.value);
    this.runtime.status = 'thinking';
    return result;
  }

  cancel(): void {
    this.aborter.abort();
    this.runtime.status = 'cancelled';
  }
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

/**
 * S02 + S06 + S08 + S09 + S10 + S11 + S12 — Orchestrator.
 *
 * End-to-end pipeline:
 *   user task → decompose → graph → schedule (pool) → blackboard → synthesize
 *
 * Yields RunEvents that the UI/store consumes. The only mutable shared state
 * across sub-agents is the Blackboard. Sub-agents never call each other.
 */
import type { StreamMessage } from '../adapters/types';
import { DEFAULT_PARAMETERS } from '../constants/default-parameters';
import type { TokenUsage } from '../types/adapters';
import type { Skill } from '../types/skills';
import type { AgentSpec, SpawnedChild } from '../types/swarm/agent';
import { EMPTY_TOKEN_USAGE } from '../types/swarm/agent';
import type { SwarmError } from '../types/swarm/errors';
import type { AgentMessage, Endpoint } from '../types/swarm/messages';
import type { IMemoryStore, MemoryQuery, MemoryRecord } from '../types/swarm/memory';
import type { ISkillRouter, RouteDecision } from '../types/swarm/routing';
import type {
  CostRollup,
  IOrchestrator,
  OrchestratorConfig,
  RunEvent,
  SwarmRun,
} from '../types/swarm/run';
import { EMPTY_COST } from '../types/swarm/run';
import type { TaskNode } from '../types/swarm/task-graph';
import type { AgentId, CorrelationId, Result, RunId, TaskId } from '../types/swarm/ids';
import {
  Err,
  Ok,
  newAgentId,
  newCorrelationId,
  newMessageId,
  newRunId,
  newTaskId,
} from '../types/swarm/ids';
import { Blackboard } from './blackboard';
import { decompose } from './decomposer';
import { MessageBus } from './message-bus';
import { memoryStore as defaultMemoryStore } from './memory/memory-store';
import { AgentPool } from './agent-pool';
import { SkillRouter } from './routing/skill-router';
import { SubAgent, type SpawnHook } from './sub-agent';
import { synthesize } from './synthesizer';
import { TaskGraph } from './task-graph';

export interface OrchestratorInit {
  config: OrchestratorConfig;
  availableSkills?: Skill[];
  memoryStore?: IMemoryStore;
  router?: ISkillRouter;
}

interface RunEventQueue {
  push: (event: RunEvent) => void;
  shift: () => RunEvent | undefined;
  waitForEvent: () => Promise<void>;
  close: (result: Result<SwarmRun, SwarmError>) => void;
  readonly done: boolean;
  readonly finalResult: Result<SwarmRun, SwarmError> | null;
  readonly length: number;
}

interface ExecuteNodeOptions {
  parentAgentId: AgentId | null;
  agentDepth: number;
  signal: AbortSignal;
}

/** Tasks shorter than this skip the planner LLM call and run as one generalist node. */
const SINGLE_NODE_THRESHOLD = 24;
const GENERALIST_SYSTEM_PROMPT = [
  'You are a specialist sub-agent inside a client-side swarm.',
  'Complete the assigned sub-task concisely and accurately.',
  'If you can answer directly, output only the result with no preamble or meta-commentary.',
  'If you truly need delegated help from one deeper specialist, respond with STRICT JSON only:',
  '{"spawnInstruction":"<the exact child sub-task to delegate>"}.',
  'Use spawning sparingly and only when a distinct child task will materially improve the answer.',
].join(' ');

export class Orchestrator implements IOrchestrator {
  private readonly cfg: OrchestratorConfig;
  private readonly pool: AgentPool;
  private readonly bus = new MessageBus(2000);
  private readonly aborter = new AbortController();
  private readonly runId: RunId;
  private readonly availableSkills: Skill[];
  private readonly memory: IMemoryStore;
  private readonly router: ISkillRouter;

  private graph: TaskGraph | null = null;
  private blackboard: Blackboard;
  private agents = new Map<AgentId, SubAgent>();
  private swarmRun: SwarmRun;

  constructor(init: OrchestratorInit) {
    this.cfg = init.config;
    this.pool = new AgentPool(init.config.maxConcurrency);
    this.runId = newRunId();
    this.blackboard = new Blackboard(this.runId);
    this.availableSkills = (init.availableSkills ?? []).filter((skill) => skill.enabled);
    this.memory = init.memoryStore ?? defaultMemoryStore;
    this.router = init.router ?? new SkillRouter({
      provider: init.config.synthesizeModel.provider,
      model: init.config.synthesizeModel.model,
      strategy: init.config.routingStrategy,
    });
    this.swarmRun = {
      id: this.runId,
      graphId: '' as never,
      rootTask: '',
      status: 'queued',
      finalAnswer: null,
      cost: { ...EMPTY_COST, perAgent: {} },
      createdAt: Date.now(),
      finishedAt: null,
      error: null,
    };
  }

  getRun(): SwarmRun { return this.swarmRun; }
  abort(): void { this.aborter.abort(); this.pool.abortAll(); }
  getMessages(): AgentMessage[] { return this.bus.snapshot(); }

  async *run_(task: string): AsyncGenerator<RunEvent, Result<SwarmRun, SwarmError>> {
    const queue = createRunEventQueue();
    void this.executeRun(task, queue.push)
      .then(queue.close)
      .catch((error) => queue.close(Err({
        kind: 'internal',
        message: error instanceof Error ? error.message : String(error),
      })));

    while (!queue.done || queue.length > 0) {
      const next = queue.shift();
      if (next) {
        yield next;
        continue;
      }
      await queue.waitForEvent();
    }

    return queue.finalResult ?? Err({ kind: 'internal', message: 'Swarm run ended without a final result.' });
  }

  run(task: string, signal: AbortSignal): AsyncGenerator<RunEvent, Result<SwarmRun, SwarmError>> {
    signal.addEventListener('abort', () => this.abort(), { once: true });
    return this.run_(task);
  }

  private async executeRun(
    task: string,
    push: (event: RunEvent) => void,
  ): Promise<Result<SwarmRun, SwarmError>> {
    this.swarmRun.rootTask = task;
    const signal = this.aborter.signal;
    const unsubscribers = [
      this.bus.subscribe((message) => push({ type: 'message', message })),
      this.blackboard.subscribe((entry) => push({ type: 'blackboard', entry })),
    ];

    try {
      this.swarmRun.status = 'planning';
      push({ type: 'run_status', status: 'planning' });

      let graph: TaskGraph;
      if (task.length < SINGLE_NODE_THRESHOLD) {
        graph = this.singleNodeGraph(task);
      } else {
        const dec = await decompose({
          task,
          runId: this.runId,
          provider: this.cfg.decomposeModel.provider,
          model: this.cfg.decomposeModel.model,
          signal,
        });
        if (!dec.ok) {
          this.fail(dec.error);
          push({ type: 'error', error: dec.error });
          return Err(dec.error);
        }
        graph = dec.value.graph;
      }

      this.graph = graph;
      this.swarmRun = { ...this.swarmRun, graphId: graph.id };
      push({ type: 'graph_built', graph: graph.toJSON() });

      this.swarmRun.status = 'running';
      push({ type: 'run_status', status: 'running' });

      while (!graph.isComplete() && !signal.aborted) {
        const ready = graph.getReadyNodes();
        if (ready.length === 0) {
          for (const node of graph.getAllNodes()) {
            if (node.status === 'pending') {
              graph.markStatus(node.id, 'skipped');
              push({ type: 'node_status', taskId: node.id, status: 'skipped' });
            }
          }
          break;
        }

        await Promise.all(ready.map(async (node) => {
          graph.markStatus(node.id, 'running');
          push({ type: 'node_status', taskId: node.id, status: 'running' });
          await this.pool.submit(async (poolSignal) => {
            await this.executeNode(node, push, {
              parentAgentId: null,
              agentDepth: node.depth + 1,
              signal: poolSignal,
            });
          });
        }));
      }

      if (signal.aborted) {
        const err: SwarmError = { kind: 'aborted', runId: this.runId };
        this.fail(err);
        push({ type: 'error', error: err });
        return Err(err);
      }

      this.swarmRun.status = 'synthesizing';
      push({ type: 'run_status', status: 'synthesizing' });

      const synth = await synthesize({
        task,
        graph,
        blackboard: this.blackboard,
        provider: this.cfg.synthesizeModel.provider,
        model: this.cfg.synthesizeModel.model,
        signal,
      });

      if (!synth.ok) {
        this.fail(synth.error);
        push({ type: 'error', error: synth.error });
        return Err(synth.error);
      }

      this.addUsage('__synthesizer__' as AgentId, synth.value.tokenUsage);
      this.swarmRun.finalAnswer = synth.value.finalAnswer;
      this.swarmRun.status = 'done';
      this.swarmRun.finishedAt = Date.now();

      await this.rememberRunSummary(task, synth.value.finalAnswer);

      push({ type: 'final', answer: synth.value.finalAnswer, cost: this.swarmRun.cost });
      push({ type: 'run_status', status: 'done' });
      return Ok(this.swarmRun);
    } finally {
      for (const unsubscribe of unsubscribers) unsubscribe();
      await this.memory.evictWorking(this.runId).catch(() => undefined);
    }
  }

  private async executeNode(
    node: TaskNode,
    push: (event: RunEvent) => void,
    options: ExecuteNodeOptions,
  ): Promise<Result<SpawnedChild, SwarmError>> {
    const agentId = newAgentId();
    const routeDecision = await this.routeNode(node, agentId, options.signal);
    const chosenSkill = routeDecision.chosenSkillId
      ? this.availableSkills.find((skill) => skill.id === routeDecision.chosenSkillId) ?? null
      : null;

    const roleLabel = node.agentRole ?? routeDecision.chosenRole;
    const systemPrompt = buildSystemPrompt(chosenSkill, node.agentRole, node.agentSystemPrompt);
    const spec: AgentSpec = {
      id: agentId,
      name: node.agentRole ? `${node.agentRole}: ${node.title}` : node.title,
      role: roleLabel,
      systemPrompt,
      skillId: chosenSkill?.id ?? null,
      toolNames: [],
      model: this.cfg.synthesizeModel.model,
      provider: this.cfg.synthesizeModel.provider,
      parameters: { ...DEFAULT_PARAMETERS, temperature: 0.4 },
    };

    const dependencyContext = this.buildDependencyContext(node.dependsOn);
    const primingMessages = await this.buildMemoryPrimingMessages(node, routeDecision.chosenSkillId);
    const spawnHook = this.createSpawnHook({
      parentAgentId: agentId,
      parentTaskId: node.id,
      parentDepth: options.agentDepth,
      signal: options.signal,
      push,
    });

    const agent = new SubAgent({
      spec,
      taskId: node.id,
      parentAgentId: options.parentAgentId,
      depth: options.agentDepth,
      instruction: node.instruction,
      dependencyContext,
      primingMessages,
      spawnHook,
    });

    this.agents.set(agentId, agent);
    this.graph?.updateNode(node.id, { assignedAgentId: agentId });
    push({ type: 'agent_status', agentId, status: 'thinking' });
    this.publishMsg({ kind: 'orchestrator' }, { kind: 'agent', agentId }, {
      type: 'task_assigned',
      taskId: node.id,
      instruction: node.instruction,
      contextKeys: node.dependsOn,
    });
    this.writeBlackboard(`task:${node.id}:status`, 'running', agentId);

    const result = await agent.run(options.signal);
    if (!result.ok) {
      this.graph?.markStatus(node.id, 'failed');
      this.graph?.updateNode(node.id, { error: result.error });
      this.writeBlackboard(`task:${node.id}:status`, 'failed', agentId);
      this.writeBlackboard(`task:${node.id}:error`, result.error, agentId);
      push({ type: 'node_status', taskId: node.id, status: 'failed', error: result.error });
      push({ type: 'agent_status', agentId, status: 'failed' });
      this.publishMsg({ kind: 'agent', agentId }, { kind: 'orchestrator' }, {
        type: 'task_error',
        taskId: node.id,
        error: result.error,
      });
      return Err(result.error);
    }

    this.writeBlackboard(`task:${node.id}:output`, result.value.text, agentId);
    this.writeBlackboard(`task:${node.id}:status`, 'done', agentId);
    this.addUsage(agentId, result.value.tokenUsage);
    this.graph?.markStatus(node.id, 'done');
    this.graph?.updateNode(node.id, {
      result: result.value.text,
      tokenUsage: result.value.tokenUsage,
    });
    await this.rememberNodeResult(node, agentId, result.value.text, routeDecision.chosenSkillId);

    push({ type: 'node_status', taskId: node.id, status: 'done', result: result.value.text });
    push({ type: 'agent_status', agentId, status: 'done' });
    this.publishMsg({ kind: 'agent', agentId }, { kind: 'orchestrator' }, {
      type: 'task_result',
      taskId: node.id,
      output: result.value.text,
      tokenUsage: result.value.tokenUsage,
    });

    return Ok({ agentId, taskId: node.id, output: result.value.text });
  }

  private createSpawnHook(args: {
    parentAgentId: AgentId;
    parentTaskId: TaskId;
    parentDepth: number;
    signal: AbortSignal;
    push: (event: RunEvent) => void;
  }): SpawnHook {
    return async (parentAgentId, parentTaskId, instruction) => {
      this.publishMsg({ kind: 'agent', agentId: parentAgentId }, { kind: 'orchestrator' }, {
        type: 'spawn_request',
        parentTaskId,
        childInstruction: instruction,
      });

      if (args.parentDepth + 1 > this.cfg.maxDepth) {
        const error: SwarmError = { kind: 'max_depth', depth: args.parentDepth + 1, limit: this.cfg.maxDepth };
        this.publishMsg({ kind: 'orchestrator' }, { kind: 'agent', agentId: parentAgentId }, {
          type: 'spawn_denied',
          reason: error,
        });
        return Err(error);
      }

      if (!this.graph) {
        const error: SwarmError = { kind: 'internal', message: 'Cannot spawn child before graph initialization.' };
        this.publishMsg({ kind: 'orchestrator' }, { kind: 'agent', agentId: parentAgentId }, {
          type: 'spawn_denied',
          reason: error,
        });
        return Err(error);
      }

      if ((this.cfg.nodeBudget ?? Number.POSITIVE_INFINITY) <= this.graph.getAllNodes().length) {
        const error: SwarmError = { kind: 'internal', message: 'Swarm node budget exhausted.' };
        this.publishMsg({ kind: 'orchestrator' }, { kind: 'agent', agentId: parentAgentId }, {
          type: 'spawn_denied',
          reason: error,
        });
        return Err(error);
      }

      const childTaskId = newTaskId();
      const childNode: TaskNode = {
        id: childTaskId,
        runId: this.runId,
        title: deriveSpawnedNodeTitle(instruction),
        instruction,
        status: 'pending',
        depth: args.parentDepth,
        dependsOn: [],
        assignedAgentId: null,
        suggestedSkillId: null,
        result: null,
        error: null,
        tokenUsage: null,
        startedAt: null,
        finishedAt: null,
      };

      this.graph.addNode(childNode);
      void this.graph.addEdge({ from: args.parentTaskId, to: childTaskId, kind: 'spawned' });
      args.push({ type: 'graph_built', graph: this.graph.toJSON() });

      this.graph.markStatus(childTaskId, 'running');
      args.push({ type: 'node_status', taskId: childTaskId, status: 'running' });

      const childResult = await this.executeNode(childNode, args.push, {
        parentAgentId: args.parentAgentId,
        agentDepth: args.parentDepth + 1,
        signal: args.signal,
      });

      if (!childResult.ok) {
        this.publishMsg({ kind: 'orchestrator' }, { kind: 'agent', agentId: parentAgentId }, {
          type: 'spawn_denied',
          reason: childResult.error,
        });
        return Err(childResult.error);
      }

      this.publishMsg({ kind: 'orchestrator' }, { kind: 'agent', agentId: parentAgentId }, {
        type: 'spawn_granted',
        childAgentId: childResult.value.agentId,
        childTaskId,
      });
      return childResult;
    };
  }

  private async routeNode(node: TaskNode, agentId: AgentId, signal: AbortSignal): Promise<RouteDecision> {
    if (this.availableSkills.length === 0) {
      return {
        taskId: node.id,
        chosenSkillId: null,
        chosenRole: 'Generalist',
        candidates: [],
        strategy: this.cfg.routingStrategy,
        reasoning: 'No enabled skills available; using generalist.',
      };
    }

    const decision = await this.router.route({
      taskId: node.id,
      instruction: node.instruction,
      suggestedSkillId: node.suggestedSkillId,
      availableSkills: this.availableSkills,
    }, signal);

    if (!decision.ok) {
      this.publishMsg({ kind: 'orchestrator' }, { kind: 'orchestrator' }, {
        type: 'log',
        level: 'warn',
        text: `Skill routing fell back to generalist for ${node.id}: ${formatError(decision.error)}`,
      });
      return {
        taskId: node.id,
        chosenSkillId: null,
        chosenRole: 'Generalist',
        candidates: [],
        strategy: this.cfg.routingStrategy,
        reasoning: 'Routing failed; using generalist.',
      };
    }

    this.publishMsg({ kind: 'orchestrator' }, { kind: 'agent', agentId }, {
      type: 'log',
      level: 'info',
      text: `Routed task "${node.title}" to ${decision.value.chosenRole}${decision.value.chosenSkillId ? ` (${decision.value.chosenSkillId})` : ''}. ${decision.value.reasoning}`,
    });
    return decision.value;
  }

  private buildDependencyContext(dependsOn: TaskId[]): string | undefined {
    const blocks = dependsOn
      .map((dependencyId) => this.blackboard.read<string>(`task:${dependencyId}:output`))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .map((entry) => `[${entry.key}]\n${String(entry.value)}`);

    return blocks.length > 0 ? blocks.join('\n\n') : undefined;
  }

  private async buildMemoryPrimingMessages(node: TaskNode, chosenSkillId: string | null): Promise<StreamMessage[]> {
    const recalled = await this.recallMemories(node.instruction, chosenSkillId);
    if (recalled.length === 0) return [];

    const memoryBlock = recalled
      .map((record, index) => `${index + 1}. [${record.scope}/${record.kind}] ${record.content}`)
      .join('\n');

    return [{
      role: 'system',
      content: [{
        type: 'text',
        text: `Relevant recalled memory for this sub-task:\n${memoryBlock}\n\nUse recalled memory only when it materially helps the answer.`,
      }],
    }];
  }

  private async recallMemories(instruction: string, chosenSkillId: string | null): Promise<MemoryRecord[]> {
    const queries: MemoryQuery[] = [
      { scope: 'working', runId: this.runId, text: instruction, limit: 3 },
      { scope: 'episodic', text: instruction, limit: 2 },
      { scope: 'semantic', text: instruction, limit: 2 },
    ];

    const tags = buildMemoryTags(instruction, chosenSkillId);
    if (tags.length > 0) {
      queries.push({ scope: 'semantic', tags, limit: 2 });
    }

    const recalled = await Promise.all(queries.map((query) => this.memory.recall(query)));
    const merged: MemoryRecord[] = [];
    const seen = new Set<string>();

    for (const result of recalled) {
      if (!result.ok) {
        this.publishMsg({ kind: 'orchestrator' }, { kind: 'orchestrator' }, {
          type: 'log',
          level: 'warn',
          text: `Memory recall failed: ${formatError(result.error)}`,
        });
        continue;
      }

      for (const record of result.value) {
        if (seen.has(record.id)) continue;
        seen.add(record.id);
        merged.push(record);
      }
    }

    return merged.slice(0, 6);
  }

  private async rememberNodeResult(
    node: TaskNode,
    agentId: AgentId,
    output: string,
    chosenSkillId: string | null,
  ): Promise<void> {
    const result = await this.memory.remember({
      scope: 'working',
      kind: 'result',
      runId: this.runId,
      agentId,
      content: `${node.title}\n${output}`,
      embedding: null,
      tags: buildMemoryTags(`${node.title} ${node.instruction}`, chosenSkillId),
      salience: node.depth === 0 ? 0.75 : 0.6,
    });

    if (!result.ok) {
      this.publishMsg({ kind: 'orchestrator' }, { kind: 'orchestrator' }, {
        type: 'log',
        level: 'warn',
        text: `Failed to remember task output for ${node.id}: ${formatError(result.error)}`,
      });
    }
  }

  private async rememberRunSummary(task: string, finalAnswer: string): Promise<void> {
    const result = await this.memory.remember({
      scope: 'episodic',
      kind: 'summary',
      runId: this.runId,
      agentId: null,
      content: `Original task:\n${task}\n\nFinal answer:\n${finalAnswer}`,
      embedding: null,
      tags: buildMemoryTags(task, null),
      salience: 0.9,
    });

    if (!result.ok) {
      this.publishMsg({ kind: 'orchestrator' }, { kind: 'orchestrator' }, {
        type: 'log',
        level: 'warn',
        text: `Failed to remember final run summary: ${formatError(result.error)}`,
      });
    }
  }

  private singleNodeGraph(task: string): TaskGraph {
    const graph = new TaskGraph(this.runId as unknown as never, this.runId);
    const id = newTaskId();
    const node: TaskNode = {
      id,
      runId: this.runId,
      title: 'Answer',
      instruction: task,
      status: 'pending',
      depth: 0,
      dependsOn: [],
      assignedAgentId: null,
      suggestedSkillId: null,
      result: null,
      error: null,
      tokenUsage: null,
      startedAt: null,
      finishedAt: null,
    };
    graph.addNode(node);
    return graph;
  }

  private writeBlackboard(key: string, value: unknown, writer: AgentId | 'orchestrator'): void {
    const expectedVersion = this.blackboard.read(key)?.version ?? 0;
    this.publishMsg(endpointForWriter(writer), { kind: 'blackboard' }, {
      type: 'blackboard_write',
      key,
      value,
      expectedVersion,
    });

    const result = this.blackboard.write(key, value, expectedVersion, writer);
    if (!result.ok) {
      this.publishMsg({ kind: 'orchestrator' }, { kind: 'orchestrator' }, {
        type: 'log',
        level: 'warn',
        text: `Blackboard write conflict for ${key}: ${formatError(result.error)}`,
      });
    }
  }

  private addUsage(agentId: AgentId, usage: TokenUsage): void {
    const tokenCounts = this.swarmRun.cost.tokenCounts;
    tokenCounts.input += usage.inputTokens;
    tokenCounts.output += usage.outputTokens;
    tokenCounts.thinking += usage.thinkingTokens;
    tokenCounts.cached += usage.cachedTokens;

    const perAgent = this.swarmRun.cost.perAgent[agentId] ?? { input: 0, output: 0, thinking: 0, cached: 0 };
    perAgent.input += usage.inputTokens;
    perAgent.output += usage.outputTokens;
    perAgent.thinking += usage.thinkingTokens;
    perAgent.cached += usage.cachedTokens;
    this.swarmRun.cost.perAgent[agentId] = perAgent;
  }

  private fail(error: SwarmError): void {
    this.swarmRun.status = error.kind === 'aborted' ? 'aborted' : 'failed';
    this.swarmRun.error = error;
    this.swarmRun.finishedAt = Date.now();
  }

  private publishMsg(from: Endpoint, to: Endpoint, payload: AgentMessage['payload']): void {
    const message: AgentMessage = {
      id: newMessageId(),
      runId: this.runId,
      from,
      to,
      type: payload.type,
      payload,
      timestamp: Date.now(),
      correlationId: newCorrelationId() as CorrelationId,
    };
    this.bus.publish(message);
  }
}

function endpointForWriter(writer: AgentId | 'orchestrator'): Endpoint {
  return writer === 'orchestrator' ? { kind: 'orchestrator' } : { kind: 'agent', agentId: writer };
}

function buildSystemPrompt(skill: Skill | null): string {
  if (!skill) return GENERALIST_SYSTEM_PROMPT;
  return `${GENERALIST_SYSTEM_PROMPT}\n\nSelected specialist skill: ${skill.name}\n${skill.instructions}`;
}

function buildMemoryTags(text: string, chosenSkillId: string | null): string[] {
  const tags = new Set<string>();
  for (const token of text.toLowerCase().split(/[^a-z0-9]+/).filter((item) => item.length > 3)) {
    if (tags.size >= 8) break;
    tags.add(token);
  }
  if (chosenSkillId) tags.add(chosenSkillId);
  return Array.from(tags);
}

function deriveSpawnedNodeTitle(instruction: string): string {
  const trimmed = instruction.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= 48) return trimmed || 'Spawned task';
  return `${trimmed.slice(0, 45)}...`;
}

function formatError(error: SwarmError): string {
  if ('message' in error && typeof error.message === 'string') return `${error.kind}: ${error.message}`;
  return error.kind;
}

function createRunEventQueue(): RunEventQueue {
  const queue: RunEvent[] = [];
  let done = false;
  let finalResult: Result<SwarmRun, SwarmError> | null = null;
  let waiter: (() => void) | null = null;

  const notify = () => {
    waiter?.();
    waiter = null;
  };

  return {
    push(event) {
      queue.push(event);
      notify();
    },
    shift() {
      return queue.shift();
    },
    waitForEvent() {
      if (queue.length > 0 || done) return Promise.resolve();
      return new Promise<void>((resolve) => {
        waiter = resolve;
      });
    },
    close(result) {
      finalResult = result;
      done = true;
      notify();
    },
    get done() {
      return done;
    },
    get finalResult() {
      return finalResult;
    },
    get length() {
      return queue.length;
    },
  };
}

void EMPTY_TOKEN_USAGE;
void ({} as CostRollup);

export function defaultSwarmConfig(provider: import('../types/models').ProviderId, model: string): OrchestratorConfig {
  return {
    maxConcurrency: 3,
    maxDepth: 3,
    decomposeModel: { provider, model },
    synthesizeModel: { provider, model },
    routingStrategy: 'hybrid',
    nodeBudget: 20,
  };
}

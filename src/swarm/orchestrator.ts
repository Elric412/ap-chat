/**
 * S02 + S06 + S08 + S09 — Orchestrator.
 *
 * End-to-end pipeline:
 *   user task → decompose → graph → schedule (pool) → blackboard → synthesize
 *
 * Yields RunEvents that the UI/store consumes. The only mutable shared state
 * across sub-agents is the Blackboard. Sub-agents never call each other.
 */
import { TaskGraph } from './task-graph';
import { Blackboard } from './blackboard';
import { AgentPool } from './agent-pool';
import { MessageBus } from './message-bus';
import { SubAgent, type SpawnHook } from './sub-agent';
import { decompose } from './decomposer';
import { synthesize } from './synthesizer';
import type {
  IOrchestrator, OrchestratorConfig, RunEvent, SwarmRun, CostRollup,
} from '../types/swarm/run';
import { EMPTY_COST } from '../types/swarm/run';
import type { Result, RunId, TaskId, AgentId, CorrelationId } from '../types/swarm/ids';
import {
  Ok, Err, newRunId, newAgentId, newMessageId, newCorrelationId,
} from '../types/swarm/ids';
import type { SwarmError } from '../types/swarm/errors';
import type { AgentSpec } from '../types/swarm/agent';
import { EMPTY_TOKEN_USAGE } from '../types/swarm/agent';
import type { TaskNode } from '../types/swarm/task-graph';
import { DEFAULT_PARAMETERS } from '../constants/default-parameters';
import type { TokenUsage } from '../types/adapters';
import type { AgentMessage, Endpoint } from '../types/swarm/messages';

export interface OrchestratorInit {
  config: OrchestratorConfig;
}

const SINGLE_NODE_THRESHOLD = 60; // chars — trivial tasks skip the decomposer LLM call

export class Orchestrator implements IOrchestrator {
  private readonly cfg: OrchestratorConfig;
  private readonly pool: AgentPool;
  private readonly bus = new MessageBus(2000);
  private readonly aborter = new AbortController();
  private readonly runId: RunId;
  private graph: TaskGraph | null = null;
  private blackboard: Blackboard;
  private agents = new Map<AgentId, SubAgent>();
  private run: SwarmRun;

  constructor(init: OrchestratorInit) {
    this.cfg = init.config;
    this.pool = new AgentPool(init.config.maxConcurrency);
    this.runId = newRunId();
    this.blackboard = new Blackboard(this.runId);
    this.run = {
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

  getRun(): SwarmRun { return this.run; }
  abort(): void { this.aborter.abort(); this.pool.abortAll(); }
  getMessages(): AgentMessage[] { return this.bus.snapshot(); }

  async *run_(task: string): AsyncGenerator<RunEvent, Result<SwarmRun, SwarmError>> {
    this.run.rootTask = task;
    const signal = this.aborter.signal;

    // ── 1. Planning ──────────────────────────────────────────
    this.run.status = 'planning';
    yield { type: 'run_status', status: 'planning' };

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
        yield { type: 'error', error: dec.error };
        return Err(dec.error);
      }
      graph = dec.value.graph;
    }

    this.graph = graph;
    this.run = { ...this.run, graphId: graph.id };
    yield { type: 'graph_built', graph: graph.toJSON() };

    // ── 2. Execute (parallel, dependency-aware) ──────────────
    this.run.status = 'running';
    yield { type: 'run_status', status: 'running' };

    const events: RunEvent[] = [];
    const drain = (): RunEvent[] => events.splice(0);

    const scheduleReady = async (): Promise<void> => {
      const ready = graph.getReadyNodes();
      const launches: Promise<void>[] = [];
      for (const node of ready) {
        graph.markStatus(node.id, 'running');
        events.push({ type: 'node_status', taskId: node.id, status: 'running' });
        launches.push(this.runNode(node, events));
      }
      await Promise.all(launches);
    };

    while (!graph.isComplete() && !signal.aborted) {
      await scheduleReady();
      for (const ev of drain()) yield ev;
      // If no nodes ran this round (all blocked / failed dependencies), break to avoid spin.
      if (graph.getReadyNodes().length === 0 && !graph.isComplete()) {
        // Promote pending nodes whose parents failed to skipped, then break.
        for (const n of graph.getAllNodes()) {
          if (n.status === 'pending') {
            graph.markStatus(n.id, 'skipped');
            events.push({ type: 'node_status', taskId: n.id, status: 'skipped' });
          }
        }
        for (const ev of drain()) yield ev;
        break;
      }
    }

    if (signal.aborted) {
      const err: SwarmError = { kind: 'aborted', runId: this.runId };
      this.fail(err);
      yield { type: 'error', error: err };
      return Err(err);
    }

    // ── 3. Synthesize ────────────────────────────────────────
    this.run.status = 'synthesizing';
    yield { type: 'run_status', status: 'synthesizing' };

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
      yield { type: 'error', error: synth.error };
      return Err(synth.error);
    }

    this.addUsage('__synthesizer__' as AgentId, synth.value.tokenUsage);
    this.run.finalAnswer = synth.value.finalAnswer;
    this.run.status = 'done';
    this.run.finishedAt = Date.now();
    yield { type: 'final', answer: synth.value.finalAnswer, cost: this.run.cost };
    yield { type: 'run_status', status: 'done' };
    return Ok(this.run);
  }

  /** IOrchestrator-compatible alias. */
  run(task: string, signal: AbortSignal): AsyncGenerator<RunEvent, Result<SwarmRun, SwarmError>> {
    signal.addEventListener('abort', () => this.abort(), { once: true });
    return this.run_(task);
  }

  // ── Internals ──────────────────────────────────────────────

  private async runNode(node: TaskNode, events: RunEvent[]): Promise<void> {
    const agentId = newAgentId();
    const spec: AgentSpec = {
      id: agentId,
      name: node.title,
      role: 'Sub-agent',
      systemPrompt: 'You are a specialist sub-agent inside a swarm. Complete the assigned sub-task concisely and accurately. Output only the result — no preamble, no meta-commentary.',
      skillId: node.suggestedSkillId,
      toolNames: [],
      model: this.cfg.synthesizeModel.model,
      provider: this.cfg.synthesizeModel.provider,
      parameters: { ...DEFAULT_PARAMETERS, temperature: 0.4 },
    };

    // Gather dependency context from blackboard.
    const deps = node.dependsOn
      .map((d) => this.blackboard.read<string>(`task:${d}:output`))
      .filter((e): e is NonNullable<typeof e> => Boolean(e))
      .map((e) => `[${e.key}]\n${String(e.value)}`)
      .join('\n\n');

    const spawnHook: SpawnHook = async () => Err({ kind: 'max_depth', depth: 1, limit: 3 });

    const agent = new SubAgent({
      spec,
      taskId: node.id,
      parentAgentId: null,
      depth: 1,
      instruction: node.instruction,
      dependencyContext: deps || undefined,
      spawnHook,
    });

    this.agents.set(agentId, agent);
    if (this.graph) this.graph.updateNode(node.id, { assignedAgentId: agentId });
    events.push({ type: 'agent_status', agentId, status: 'thinking' });
    this.publishMsg({ kind: 'orchestrator' }, { kind: 'agent', agentId }, {
      type: 'task_assigned', taskId: node.id, instruction: node.instruction, contextKeys: node.dependsOn,
    });

    try {
      await this.pool.submit(async (poolSignal) => {
        const result = await agent.run(poolSignal);
        if (result.ok) {
          this.blackboard.write(
            `task:${node.id}:output`,
            result.value.text,
            this.blackboard.read(`task:${node.id}:output`)?.version ?? 0,
            agentId,
          );
          this.addUsage(agentId, result.value.tokenUsage);
          if (this.graph) {
            this.graph.markStatus(node.id, 'done');
            this.graph.updateNode(node.id, { result: result.value.text, tokenUsage: result.value.tokenUsage });
          }
          events.push({ type: 'node_status', taskId: node.id, status: 'done', result: result.value.text });
          events.push({ type: 'agent_status', agentId, status: 'done' });
          this.publishMsg({ kind: 'agent', agentId }, { kind: 'orchestrator' }, {
            type: 'task_result', taskId: node.id, output: result.value.text, tokenUsage: result.value.tokenUsage,
          });
        } else {
          if (this.graph) {
            this.graph.markStatus(node.id, 'failed');
            this.graph.updateNode(node.id, { error: result.error });
          }
          events.push({ type: 'node_status', taskId: node.id, status: 'failed', error: result.error });
          events.push({ type: 'agent_status', agentId, status: 'failed' });
          this.publishMsg({ kind: 'agent', agentId }, { kind: 'orchestrator' }, {
            type: 'task_error', taskId: node.id, error: result.error,
          });
        }
      });
    } catch {
      if (this.graph) this.graph.markStatus(node.id, 'failed');
      events.push({ type: 'node_status', taskId: node.id, status: 'failed' });
    }
  }

  private singleNodeGraph(task: string): TaskGraph {
    const g = new TaskGraph(this.runId as unknown as never, this.runId);
    const id = newAgentId() as unknown as TaskId;
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
    g.addNode(node);
    return g;
  }

  private addUsage(agentId: AgentId, usage: TokenUsage): void {
    const tc = this.run.cost.tokenCounts;
    tc.input += usage.inputTokens;
    tc.output += usage.outputTokens;
    tc.thinking += usage.thinkingTokens;
    tc.cached += usage.cachedTokens;
    const per = this.run.cost.perAgent[agentId] ?? { input: 0, output: 0, thinking: 0, cached: 0 };
    per.input += usage.inputTokens;
    per.output += usage.outputTokens;
    per.thinking += usage.thinkingTokens;
    per.cached += usage.cachedTokens;
    this.run.cost.perAgent[agentId] = per;
  }

  private fail(error: SwarmError): void {
    this.run.status = error.kind === 'aborted' ? 'aborted' : 'failed';
    this.run.error = error;
    this.run.finishedAt = Date.now();
  }

  private publishMsg(from: Endpoint, to: Endpoint, payload: AgentMessage['payload']): void {
    const msg: AgentMessage = {
      id: newMessageId(),
      runId: this.runId,
      from, to,
      type: payload.type,
      payload,
      timestamp: Date.now(),
      correlationId: newCorrelationId() as CorrelationId,
    };
    this.bus.publish(msg);
  }
}

void EMPTY_TOKEN_USAGE;

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

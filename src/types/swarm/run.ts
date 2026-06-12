import type { TokenCounts, CostEstimate } from '../messages';
import type { ProviderId } from '../models';
import type { GraphId, RunId, TaskId, AgentId, Result } from './ids';
import type { SwarmError } from './errors';
import type { SerializedGraph, TaskStatus } from './task-graph';
import type { AgentStatus } from './agent';
import type { AgentMessage } from './messages';
import type { BlackboardEntry } from './blackboard';

export type RunStatus =
  | 'queued' | 'planning' | 'running' | 'synthesizing'
  | 'done' | 'failed' | 'aborted';

export interface CostRollup {
  tokenCounts: TokenCounts;
  costEstimate: CostEstimate;
  perAgent: Record<string, TokenCounts>;
}

export interface SwarmRun {
  readonly id: RunId;
  readonly graphId: GraphId;
  rootTask: string;
  status: RunStatus;
  finalAnswer: string | null;
  cost: CostRollup;
  createdAt: number;
  finishedAt: number | null;
  error: SwarmError | null;
}

export type RunEvent =
  | { type: 'run_status'; status: RunStatus }
  | { type: 'graph_built'; graph: SerializedGraph }
  | { type: 'node_status'; taskId: TaskId; status: TaskStatus; result?: string; error?: SwarmError }
  | { type: 'agent_status'; agentId: AgentId; status: AgentStatus }
  | { type: 'message'; message: AgentMessage }
  | { type: 'blackboard'; entry: BlackboardEntry }
  | { type: 'final'; answer: string; cost: CostRollup }
  | { type: 'error'; error: SwarmError };

export interface OrchestratorConfig {
  maxConcurrency: number;
  maxDepth: 3;
  decomposeModel: { provider: ProviderId; model: string };
  synthesizeModel: { provider: ProviderId; model: string };
  routingStrategy: 'heuristic' | 'llm' | 'hybrid';
  nodeBudget?: number; // soft cap on total nodes (incl. spawned)
}

export interface IOrchestrator {
  run(task: string, signal: AbortSignal): AsyncGenerator<RunEvent, Result<SwarmRun, SwarmError>>;
  abort(): void;
  getRun(): SwarmRun;
}

export interface IAgentPool {
  readonly size: number;
  readonly inFlight: number;
  submit<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T>;
  drain(): Promise<void>;
  abortAll(): void;
}

export const EMPTY_COST: CostRollup = {
  tokenCounts: { input: 0, output: 0, thinking: 0, cached: 0 },
  costEstimate: { inputCost: 0, outputCost: 0, thinkingCost: 0, cachedDiscount: 0, totalCost: 0 },
  perAgent: {},
};

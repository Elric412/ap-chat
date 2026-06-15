import { z } from 'zod';
import type { TokenUsage } from '../adapters';
import type { AgentId, GraphId, RunId, TaskId, Result } from './ids';
import type { SwarmError } from './errors';

export type TaskStatus = 'pending' | 'ready' | 'running' | 'done' | 'failed' | 'skipped';
export type EdgeKind = 'depends_on' | 'spawned';

export interface TaskNode {
  readonly id: TaskId;
  readonly runId: RunId;
  title: string;
  instruction: string;
  status: TaskStatus;
  depth: number;
  dependsOn: TaskId[];
  assignedAgentId: AgentId | null;
  suggestedSkillId: string | null;
  /** Specialist role label produced by the roster planner (e.g. "Researcher"). */
  agentRole: string | null;
  /** Custom system prompt the orchestrator should hand to this sub-agent. */
  agentSystemPrompt: string | null;
  result: string | null;
  error: SwarmError | null;
  tokenUsage: TokenUsage | null;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface TaskEdge {
  readonly from: TaskId;
  readonly to: TaskId;
  readonly kind: EdgeKind;
}

export interface SerializedGraph {
  id: GraphId;
  runId: RunId;
  nodes: TaskNode[];
  edges: TaskEdge[];
}

export interface ITaskGraph {
  readonly id: GraphId;
  readonly runId: RunId;
  addNode(node: TaskNode): void;
  addEdge(edge: TaskEdge): Result<void, SwarmError>;
  getNode(id: TaskId): TaskNode | undefined;
  getAllNodes(): TaskNode[];
  getReadyNodes(): TaskNode[];
  topologicalOrder(): Result<TaskId[], SwarmError>;
  markStatus(id: TaskId, status: TaskStatus): void;
  updateNode(id: TaskId, patch: Partial<TaskNode>): void;
  isComplete(): boolean;
  toJSON(): SerializedGraph;
}

/**
 * Schema the decomposer LLM output is validated against.
 * Capped at 20 nodes to prevent runaway plans.
 */
export const DecomposedNodeSchema = z.object({
  tempId: z.string().min(1),
  title: z.string().min(1).max(200),
  instruction: z.string().min(1).max(4000),
  dependsOn: z.array(z.string()).default([]),
  suggestedSkillId: z.string().nullable().default(null),
  /** Specialist role label (e.g. "Researcher", "Code Critic"). */
  agentRole: z.string().min(1).max(80).nullable().default(null),
  /** Custom system prompt for this specialist agent. */
  agentSystemPrompt: z.string().min(1).max(2000).nullable().default(null),
});

export const DecomposedPlanSchema = z.object({
  nodes: z.array(DecomposedNodeSchema).min(1).max(20),
});

export type DecomposedPlan = z.infer<typeof DecomposedPlanSchema>;
export type DecomposedNode = z.infer<typeof DecomposedNodeSchema>;

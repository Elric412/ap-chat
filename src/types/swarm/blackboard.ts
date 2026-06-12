import type { AgentId, RunId, Result } from './ids';
import type { SwarmError } from './errors';

export interface BlackboardEntry<V = unknown> {
  readonly key: string;
  readonly runId: RunId;
  value: V;
  version: number;
  writerAgentId: AgentId | 'orchestrator';
  updatedAt: number;
}

export type ReservedKey =
  | `task:${string}:status`
  | `task:${string}:output`
  | `task:${string}:error`
  | `task:${string}:timestamps`
  | `run:status`;

export interface IBlackboard {
  readonly runId: RunId;
  read<V>(key: string): BlackboardEntry<V> | undefined;
  write<V>(
    key: string,
    value: V,
    expectedVersion: number,
    writer: AgentId | 'orchestrator',
  ): Result<BlackboardEntry<V>, SwarmError>;
  update<V>(
    key: string,
    fn: (current: V | undefined) => V,
    writer: AgentId | 'orchestrator',
    maxRetries?: number,
  ): Result<BlackboardEntry<V>, SwarmError>;
  keys(prefix?: string): string[];
  snapshot(): BlackboardEntry[];
  subscribe(listener: (entry: BlackboardEntry) => void): () => void;
}

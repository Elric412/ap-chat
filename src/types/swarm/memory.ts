import type { AgentId, MemoryId, RunId, Result } from './ids';
import type { SwarmError } from './errors';

export type MemoryScope = 'working' | 'episodic' | 'semantic';
export type MemoryKind = 'fact' | 'result' | 'preference' | 'summary' | 'tool_output';

export interface MemoryRecord {
  readonly id: MemoryId;
  scope: MemoryScope;
  kind: MemoryKind;
  runId: RunId | null;
  agentId: AgentId | null;
  content: string;
  embedding: number[] | null;
  tags: string[];
  salience: number;
  createdAt: number;
  lastAccessedAt: number;
}

export interface MemoryQuery {
  scope?: MemoryScope;
  runId?: RunId;
  tags?: string[];
  text?: string;
  limit?: number;
}

export interface IMemoryStore {
  remember(
    input: Omit<MemoryRecord, 'id' | 'createdAt' | 'lastAccessedAt'>,
  ): Promise<Result<MemoryId, SwarmError>>;
  recall(query: MemoryQuery): Promise<Result<MemoryRecord[], SwarmError>>;
  promote(id: MemoryId, to: MemoryScope): Promise<Result<void, SwarmError>>;
  evictWorking(runId: RunId): Promise<void>;
}

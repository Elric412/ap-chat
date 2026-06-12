import type { TokenUsage } from '../adapters';
import type { ProviderId } from '../models';
import type { InferenceParameters } from '../parameters';
import type { ToolResult, WebSearchResult } from '../messages';
import type { StreamMessage } from '../../adapters/types';
import type { AgentId, TaskId, Result } from './ids';
import type { SwarmError } from './errors';

export type AgentStatus =
  | 'idle' | 'thinking' | 'calling_tool' | 'awaiting_child'
  | 'done' | 'failed' | 'cancelled';

export interface AgentSpec {
  readonly id: AgentId;
  name: string;
  role: string;
  systemPrompt: string;
  skillId: string | null;
  toolNames: string[];
  model: string;
  provider: ProviderId;
  parameters: InferenceParameters;
}

export interface AgentRuntime {
  readonly spec: AgentSpec;
  readonly taskId: TaskId;
  readonly parentAgentId: AgentId | null;
  readonly depth: number;
  status: AgentStatus;
  contextMessages: StreamMessage[];
  tokenUsage: TokenUsage;
  childAgentIds: AgentId[];
  startedAt: number | null;
  finishedAt: number | null;
}

export interface AgentOutput {
  readonly taskId: TaskId;
  readonly agentId: AgentId;
  text: string;
  tokenUsage: TokenUsage;
  toolResults: ToolResult[];
  citations: WebSearchResult[];
}

export interface ISubAgent {
  readonly runtime: AgentRuntime;
  run(signal: AbortSignal): Promise<Result<AgentOutput, SwarmError>>;
  spawnChild(instruction: string): Promise<Result<AgentId, SwarmError>>;
  cancel(): void;
}

export const MAX_AGENT_DEPTH = 3 as const;

export const EMPTY_TOKEN_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
  cachedTokens: 0,
  totalTokens: 0,
};

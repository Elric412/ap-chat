import type { ProviderId } from './models';
import type { ToolCall } from './messages';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  cachedTokens: number;
  totalTokens: number;
}

export type StreamEventType =
  | 'message_start'
  | 'delta_text'
  | 'delta_thinking'
  | 'tool_call'
  | 'citation'
  | 'usage'
  | 'message_end'
  | 'error';

export interface NormalizedStreamEvent {
  type: StreamEventType;
  content?: string;
  toolCall?: Partial<ToolCall>;
  citation?: { url: string; title: string; snippet: string; source: string; fetchedAt: number };
  usage?: TokenUsage;
  error?: ClassifiedError;
}

export type ClassifiedErrorType =
  | 'auth'
  | 'rate_limit'
  | 'quota'
  | 'context_overflow'
  | 'content_policy'
  | 'network'
  | 'server'
  | 'malformed_request'
  | 'unsupported_capability'
  | 'provider_outage'
  | 'unknown';

export interface ClassifiedError {
  type: ClassifiedErrorType;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
  httpStatus?: number;
  providerId: ProviderId;
  raw?: unknown;
}

import type { ProviderId } from './models';
import type { InferenceParameters } from './parameters';

/** Discriminated union of content parts */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; attachmentId: string; altText?: string; mimeType: string }
  | { type: 'audio'; attachmentId: string; mimeType: string; duration?: number }
  | { type: 'video'; attachmentId: string; mimeType: string; duration?: number }
  | { type: 'file'; attachmentId: string; fileName: string; mimeType: string }
  | { type: 'citation'; url: string; title: string; snippet: string; index: number };

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
export type MessageStatus = 'pending' | 'streaming' | 'complete' | 'aborted' | 'error' | 'partial';

export type ErrorType =
  | 'auth'
  | 'rate_limit'
  | 'quota'
  | 'context_overflow'
  | 'content_policy'
  | 'network'
  | 'server'
  | 'malformed_request'
  | 'unsupported_capability'
  | 'unknown';

export interface MessageError {
  type: ErrorType;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
}

export interface ToolCall {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
  status: 'pending_approval' | 'approved' | 'denied' | 'executing' | 'completed' | 'failed';
}

export interface ToolResult {
  toolCallId: string;
  output: string | Record<string, unknown>;
  isError: boolean;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  fetchedAt: number;
  selectedPassages?: string[];
}

export interface TokenCounts {
  input: number;
  output: number;
  thinking: number;
  cached: number;
}

export interface CostEstimate {
  inputCost: number;
  outputCost: number;
  thinkingCost: number;
  cachedDiscount: number;
  totalCost: number;
}

export interface MessageMetadata {
  editedFrom?: string;
  generationIndex?: number;
  pinned: boolean;
  bookmarked: boolean;
  /** When set, this assistant node was produced by an autonomous agent step. */
  agentStep?: number;
  /** When set, this message turn is backed by a swarm run; trace UI is shown inline. */
  swarmRunId?: string;
}

export interface MessageNode {
  id: string;
  conversationId: string;
  parentId: string | null;
  branchId: string;
  childIds: string[];
  activeChildIndex: number;
  role: MessageRole;
  content: ContentPart[];
  model: string | null;
  provider: ProviderId | null;
  parameters: InferenceParameters;
  tokenCounts: TokenCounts;
  costEstimate: CostEstimate;
  timestamp: number;
  latency: number | null;
  status: MessageStatus;
  error?: MessageError;
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  thinkingContent: string | null;
  attachmentIds: string[];
  webSearchResults: WebSearchResult[];
  artifactRefs: string[];
  comparisonId: string | null;
  summaryRefs: string[];
  metadata: MessageMetadata;
  _clock: number;
  _deleted: boolean;
}

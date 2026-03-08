/**
 * Provider Adapter Interface
 * 
 * Each provider adapter normalizes its streaming API into a common
 * AsyncGenerator<NormalizedStreamEvent> interface. Adapters are leaf
 * modules — no cross-adapter imports.
 */

import type { ProviderId } from '../types/models';
import type { NormalizedStreamEvent } from '../types/adapters';
import type { InferenceParameters } from '../types/parameters';
import type { ContentPart } from '../types/messages';

export interface StreamRequest {
  model: string;
  messages: StreamMessage[];
  parameters: InferenceParameters;
  signal?: AbortSignal;
  /** Processed attachments for the current user message (multimodal) */
  attachments?: import('../engine/attachment-processor').ProcessedAttachment[];
  /** Whether to enable web search / grounding for this request */
  webSearchEnabled?: boolean;
}

export interface StreamMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: ContentPart[];
  toolCallId?: string;
}

export interface ProviderAdapter {
  readonly providerId: ProviderId;
  stream(apiKey: string, request: StreamRequest): AsyncGenerator<NormalizedStreamEvent, void, undefined>;
  validateKey(apiKey: string): Promise<boolean>;
}

/**
 * OpenAI Provider Adapter
 * 
 * Streams completions from OpenAI-compatible APIs using SSE.
 * Normalizes delta events into NormalizedStreamEvent.
 * Handles tool calls (function calling) and web search.
 */

import type { ProviderAdapter, StreamRequest, StreamMessage } from '../types';
import type { NormalizedStreamEvent, ClassifiedError } from '../../types/adapters';
import type { ProcessedAttachment } from '../../engine/attachment-processor';
import { buildMultimodalContent } from '../../engine/attachment-processor';
import { PROVIDER_META } from '../../constants/provider-meta';

function buildMessages(
  messages: StreamMessage[],
  attachments?: ProcessedAttachment[]
): Array<Record<string, unknown>> {
  return messages.map((msg, i) => {
    const textParts = msg.content.filter((p) => p.type === 'text');
    const text = textParts.map((p) => (p as { type: 'text'; text: string }).text).join('\n');
    const hasNonText = msg.content.some((p) => p.type !== 'text');

    if (msg.role === 'tool' && msg.toolCallId) {
      return { role: 'tool', tool_call_id: msg.toolCallId, content: text };
    }

    // For the last user message, inject multimodal attachments
    const isLastUser = msg.role === 'user' && i === messages.length - 1;
    if (isLastUser && attachments?.length) {
      const parts = buildMultimodalContent(text, attachments);
      return { role: 'user', content: parts };
    }

    // If message has non-text content parts (from history), check for images
    if (hasNonText && msg.role === 'user') {
      const imageParts = msg.content.filter((p) => p.type === 'image');
      if (imageParts.length > 0) {
        // Historical multimodal — we only have references, not data URLs
        // Fall back to text-only for now
        return { role: msg.role, content: text };
      }
    }

    return { role: msg.role, content: text };
  });
}

function classifyError(status: number, body: string): ClassifiedError {
  const parsed = (() => { try { return JSON.parse(body); } catch { return null; } })();
  const message = parsed?.error?.message ?? body;

  if (status === 401) return { type: 'auth', message, retryable: false, httpStatus: status, providerId: 'openai' };
  if (status === 429) return { type: 'rate_limit', message, retryable: true, retryAfterMs: 5000, httpStatus: status, providerId: 'openai' };
  if (status === 402) return { type: 'quota', message, retryable: false, httpStatus: status, providerId: 'openai' };
  if (status === 400 && message.includes('context_length')) return { type: 'context_overflow', message, retryable: false, httpStatus: status, providerId: 'openai' };
  if (status >= 500) return { type: 'server', message, retryable: true, retryAfterMs: 2000, httpStatus: status, providerId: 'openai' };
  return { type: 'unknown', message, retryable: false, httpStatus: status, providerId: 'openai' };
}

export const openaiAdapter: ProviderAdapter = {
  providerId: 'openai',

  async *stream(apiKey: string, request: StreamRequest): AsyncGenerator<NormalizedStreamEvent, void, undefined> {
    const baseUrl = PROVIDER_META.openai.baseUrl;

    const body: Record<string, unknown> = {
      model: request.model,
      messages: buildMessages(request.messages, request.attachments),
      stream: true,
      stream_options: { include_usage: true },
    };

    if (request.parameters.temperature !== null) body.temperature = request.parameters.temperature;
    if (request.parameters.topP !== null) body.top_p = request.parameters.topP;
    if (request.parameters.maxOutputTokens !== null) body.max_completion_tokens = request.parameters.maxOutputTokens;
    if (request.parameters.frequencyPenalty !== null) body.frequency_penalty = request.parameters.frequencyPenalty;
    if (request.parameters.presencePenalty !== null) body.presence_penalty = request.parameters.presencePenalty;
    if (request.parameters.seed !== null) body.seed = request.parameters.seed;
    if (request.parameters.stopSequences.length > 0) body.stop = request.parameters.stopSequences;
    if (request.parameters.responseFormat === 'json') body.response_format = { type: 'json_object' };

    // Thinking (o-series models)
    if (request.parameters.thinkingEnabled) {
      body.reasoning_effort = request.parameters.thinkingLevel;
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: request.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      yield { type: 'error', error: classifyError(response.status, errorBody) };
      return;
    }

    yield { type: 'message_start' };

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Tool call accumulation state
    const pendingToolCalls = new Map<number, { id: string; name: string; args: string }>();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIdx).trim();
          buffer = buffer.slice(newlineIdx + 1);

          if (!line || line.startsWith(':')) continue;
          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            // Emit any accumulated tool calls
            for (const [, tc] of pendingToolCalls) {
              let parsedArgs: Record<string, unknown> = {};
              try { parsedArgs = JSON.parse(tc.args); } catch { /* keep empty */ }
              yield {
                type: 'tool_call',
                toolCall: {
                  id: tc.id,
                  toolName: tc.name,
                  arguments: parsedArgs,
                  status: 'pending_approval',
                },
              };
            }
            yield { type: 'message_end' };
            return;
          }

          let parsed: Record<string, unknown>;
          try { parsed = JSON.parse(data); } catch { continue; }

          const choice = (parsed.choices as Array<Record<string, unknown>>)?.[0];

          if (choice) {
            const delta = choice.delta as Record<string, unknown> | undefined;

            // Text content
            if (delta?.content && typeof delta.content === 'string') {
              yield { type: 'delta_text', content: delta.content };
            }

            // Reasoning/thinking content (o-series)
            if (delta?.reasoning_content && typeof delta.reasoning_content === 'string') {
              yield { type: 'delta_thinking', content: delta.reasoning_content };
            }

            // Tool calls (function calling)
            const toolCalls = delta?.tool_calls as Array<Record<string, unknown>> | undefined;
            if (toolCalls) {
              for (const tc of toolCalls) {
                const index = tc.index as number;
                const fnObj = tc.function as Record<string, unknown> | undefined;

                if (!pendingToolCalls.has(index)) {
                  pendingToolCalls.set(index, {
                    id: (tc.id as string) ?? '',
                    name: (fnObj?.name as string) ?? '',
                    args: '',
                  });
                }

                const existing = pendingToolCalls.get(index)!;
                if (tc.id && typeof tc.id === 'string') existing.id = tc.id;
                if (fnObj?.name && typeof fnObj.name === 'string') existing.name = fnObj.name;
                if (fnObj?.arguments && typeof fnObj.arguments === 'string') {
                  existing.args += fnObj.arguments;
                }
              }
            }
          }

          // Usage in final chunk
          const usage = parsed.usage as Record<string, number> | undefined;
          if (usage) {
            const completionDetails = (usage as Record<string, unknown>).completion_tokens_details as Record<string, number> | undefined;
            const promptDetails = (usage as Record<string, unknown>).prompt_tokens_details as Record<string, number> | undefined;
            yield {
              type: 'usage',
              usage: {
                inputTokens: usage.prompt_tokens ?? 0,
                outputTokens: usage.completion_tokens ?? 0,
                thinkingTokens: completionDetails?.reasoning_tokens ?? 0,
                cachedTokens: promptDetails?.cached_tokens ?? 0,
                totalTokens: usage.total_tokens ?? 0,
              },
            };
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: 'message_end' };
  },

  async validateKey(apiKey: string): Promise<boolean> {
    try {
      const response = await fetch(`${PROVIDER_META.openai.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  },
};

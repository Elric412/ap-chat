/**
 * OpenAI Provider Adapter
 * 
 * Streams completions from OpenAI-compatible APIs using SSE.
 * Normalizes delta events into NormalizedStreamEvent.
 */

import type { ProviderAdapter, StreamRequest, StreamMessage } from '../types';
import type { NormalizedStreamEvent, ClassifiedError } from '../../types/adapters';
import { PROVIDER_META } from '../../constants/provider-meta';

function buildMessages(messages: StreamMessage[]): Array<Record<string, unknown>> {
  return messages.map((msg) => {
    const textParts = msg.content.filter((p) => p.type === 'text');
    const text = textParts.map((p) => (p as { type: 'text'; text: string }).text).join('\n');

    if (msg.role === 'tool' && msg.toolCallId) {
      return { role: 'tool', tool_call_id: msg.toolCallId, content: text };
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
      messages: buildMessages(request.messages),
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
            yield { type: 'message_end' };
            return;
          }

          let parsed: Record<string, unknown>;
          try { parsed = JSON.parse(data); } catch { continue; }

          const choice = (parsed.choices as Array<Record<string, unknown>>)?.[0];

          if (choice) {
            const delta = choice.delta as Record<string, unknown> | undefined;
            if (delta?.content && typeof delta.content === 'string') {
              yield { type: 'delta_text', content: delta.content };
            }
            // Reasoning/thinking content (o-series)
            if (delta?.reasoning_content && typeof delta.reasoning_content === 'string') {
              yield { type: 'delta_thinking', content: delta.reasoning_content };
            }
          }

          // Usage in final chunk
          const usage = parsed.usage as Record<string, number> | undefined;
          if (usage) {
            yield {
              type: 'usage',
              usage: {
                inputTokens: usage.prompt_tokens ?? 0,
                outputTokens: usage.completion_tokens ?? 0,
                thinkingTokens: usage.reasoning_tokens ?? usage.completion_tokens_details?.reasoning_tokens ?? 0,
                cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
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

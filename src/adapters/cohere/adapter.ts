/**
 * Cohere Provider Adapter
 * 
 * Streams completions from Cohere's Chat API v2.
 * Handles tool use, citations, and connectors.
 * Cohere uses its own SSE format (not OpenAI-compatible).
 */

import type { ProviderAdapter, StreamRequest, StreamMessage } from '../types';
import type { NormalizedStreamEvent, ClassifiedError } from '../../types/adapters';
import { PROVIDER_META } from '../../constants/provider-meta';

function buildMessages(messages: StreamMessage[]): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];

  for (const msg of messages) {
    const textParts = msg.content.filter((p) => p.type === 'text');
    const text = textParts.map((p) => (p as { type: 'text'; text: string }).text).join('\n');

    if (msg.role === 'system') {
      result.push({ role: 'system', content: text });
    } else if (msg.role === 'tool' && msg.toolCallId) {
      result.push({ role: 'tool', tool_call_id: msg.toolCallId, content: [{ type: 'text', text }] });
    } else {
      result.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: text });
    }
  }

  return result;
}

function classifyError(status: number, body: string): ClassifiedError {
  const parsed = (() => { try { return JSON.parse(body); } catch { return null; } })();
  const message = parsed?.message ?? body;

  if (status === 401) return { type: 'auth', message, retryable: false, httpStatus: status, providerId: 'cohere' };
  if (status === 429) return { type: 'rate_limit', message, retryable: true, retryAfterMs: 5000, httpStatus: status, providerId: 'cohere' };
  if (status === 402) return { type: 'quota', message, retryable: false, httpStatus: status, providerId: 'cohere' };
  if (status >= 500) return { type: 'server', message, retryable: true, retryAfterMs: 2000, httpStatus: status, providerId: 'cohere' };
  return { type: 'unknown', message, retryable: false, httpStatus: status, providerId: 'cohere' };
}

export const cohereAdapter: ProviderAdapter = {
  providerId: 'cohere',

  async *stream(apiKey: string, request: StreamRequest): AsyncGenerator<NormalizedStreamEvent, void, undefined> {
    const baseUrl = PROVIDER_META.cohere.baseUrl;

    const body: Record<string, unknown> = {
      model: request.model,
      messages: buildMessages(request.messages),
      stream: true,
    };

    if (request.parameters.temperature !== null) body.temperature = request.parameters.temperature;
    if (request.parameters.topP !== null) body.p = request.parameters.topP;
    if (request.parameters.topK !== null) body.k = request.parameters.topK;
    if (request.parameters.maxOutputTokens !== null) body.max_tokens = request.parameters.maxOutputTokens;
    if (request.parameters.stopSequences.length > 0) body.stop_sequences = request.parameters.stopSequences;
    if (request.parameters.frequencyPenalty !== null) body.frequency_penalty = request.parameters.frequencyPenalty;
    if (request.parameters.presencePenalty !== null) body.presence_penalty = request.parameters.presencePenalty;
    if (request.parameters.seed !== null) body.seed = request.parameters.seed;

    if (request.webSearchEnabled) {
      body.connectors = [{ id: 'web-search' }];
    }

    const response = await fetch(`${baseUrl}/v2/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
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
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // Cohere tool call accumulation
    const pendingToolCalls = new Map<number, { id: string; name: string; args: Record<string, unknown> }>();

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
          if (line.startsWith('event: ')) continue;
          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            yield { type: 'message_end' };
            return;
          }

          let parsed: Record<string, unknown>;
          try { parsed = JSON.parse(data); } catch { continue; }

          const eventType = parsed.type as string;

          switch (eventType) {
            case 'content-delta': {
              const delta = parsed.delta as Record<string, unknown> | undefined;
              const msg = delta?.message as Record<string, unknown> | undefined;
              const content = msg?.content as Record<string, unknown> | undefined;
              const text = content?.text as string | undefined;
              if (text) yield { type: 'delta_text', content: text };
              break;
            }

            case 'tool-call-start': {
              const delta = parsed.delta as Record<string, unknown> | undefined;
              const tc = delta?.tool_call as Record<string, unknown> | undefined;
              if (tc) {
                const idx = (parsed.index as number) ?? pendingToolCalls.size;
                pendingToolCalls.set(idx, {
                  id: (tc.id as string) ?? '',
                  name: (tc.function as Record<string, unknown>)?.name as string ?? '',
                  args: {},
                });
              }
              break;
            }

            case 'tool-call-delta': {
              // Cohere streams tool call arguments as partial JSON
              break;
            }

            case 'tool-call-end': {
              for (const [, tc] of pendingToolCalls) {
                yield {
                  type: 'tool_call',
                  toolCall: { id: tc.id, toolName: tc.name, arguments: tc.args, status: 'pending_approval' },
                };
              }
              pendingToolCalls.clear();
              break;
            }

            case 'citation-start': {
              const delta = parsed.delta as Record<string, unknown> | undefined;
              const citation = delta?.message as Record<string, unknown> | undefined;
              const citations = citation?.citations as Array<Record<string, unknown>> | undefined;
              if (citations) {
                for (const c of citations) {
                  const sources = c.sources as Array<Record<string, unknown>> | undefined;
                  if (sources) {
                    for (const src of sources) {
                      if (src.url) {
                        yield {
                          type: 'citation',
                          citation: {
                            url: src.url as string,
                            title: (src.title as string) ?? '',
                            snippet: '',
                            source: src.url as string,
                            fetchedAt: Date.now(),
                          },
                        };
                      }
                    }
                  }
                }
              }
              break;
            }

            case 'message-end': {
              const delta = parsed.delta as Record<string, unknown> | undefined;
              const meta = delta?.usage as Record<string, unknown> | undefined;
              const billedUnits = meta?.billed_units as Record<string, number> | undefined;
              const tokens = meta?.tokens as Record<string, number> | undefined;
              totalInputTokens = tokens?.input_tokens ?? billedUnits?.input_tokens ?? 0;
              totalOutputTokens = tokens?.output_tokens ?? billedUnits?.output_tokens ?? 0;
              break;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (totalInputTokens > 0 || totalOutputTokens > 0) {
      yield {
        type: 'usage',
        usage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          thinkingTokens: 0,
          cachedTokens: 0,
          totalTokens: totalInputTokens + totalOutputTokens,
        },
      };
    }

    yield { type: 'message_end' };
  },

  async validateKey(apiKey: string): Promise<boolean> {
    try {
      const response = await fetch(`${PROVIDER_META.cohere.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  },
};

/**
 * Anthropic Provider Adapter
 * 
 * Streams completions from the Anthropic Messages API using SSE.
 * Handles thinking blocks, tool use, and prompt caching.
 */

import type { ProviderAdapter, StreamRequest, StreamMessage } from '../types';
import type { NormalizedStreamEvent, ClassifiedError } from '../../types/adapters';
import type { ProcessedAttachment } from '../../engine/attachment-processor';
import { PROVIDER_META } from '../../constants/provider-meta';

function buildMessages(messages: StreamMessage[], attachments?: ProcessedAttachment[]): {
  system?: string;
  messages: Array<Record<string, unknown>>;
} {
  let systemPrompt: string | undefined;
  const apiMessages: Array<Record<string, unknown>> = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const textParts = msg.content.filter((p) => p.type === 'text');
    const text = textParts.map((p) => (p as { type: 'text'; text: string }).text).join('\n');

    if (msg.role === 'system') {
      systemPrompt = text;
      continue;
    }

    // Last user message with attachments → multimodal
    const isLastUser = msg.role === 'user' && i === messages.length - 1;
    if (isLastUser && attachments?.length) {
      const contentParts: Array<Record<string, unknown>> = [];
      for (const pa of attachments) {
        if (pa.attachment.type === 'image') {
          const base64 = pa.dataUrl.split(',')[1] ?? '';
          contentParts.push({
            type: 'image',
            source: { type: 'base64', media_type: pa.attachment.mimeType, data: base64 },
          });
        } else if (pa.attachment.type === 'document' && pa.attachment.mimeType === 'application/pdf') {
          const base64 = pa.dataUrl.split(',')[1] ?? '';
          contentParts.push({
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 },
          });
        }
      }
      contentParts.push({ type: 'text', text });
      apiMessages.push({ role: 'user', content: contentParts });
    } else {
      apiMessages.push({ role: msg.role, content: text });
    }
  }

  return { system: systemPrompt, messages: apiMessages };
}

function classifyError(status: number, body: string): ClassifiedError {
  const parsed = (() => { try { return JSON.parse(body); } catch { return null; } })();
  const message = parsed?.error?.message ?? body;

  if (status === 401) return { type: 'auth', message, retryable: false, httpStatus: status, providerId: 'anthropic' };
  if (status === 429) return { type: 'rate_limit', message, retryable: true, retryAfterMs: 5000, httpStatus: status, providerId: 'anthropic' };
  if (status === 400 && message.includes('credit')) return { type: 'quota', message, retryable: false, httpStatus: status, providerId: 'anthropic' };
  if (status === 400 && message.includes('too long')) return { type: 'context_overflow', message, retryable: false, httpStatus: status, providerId: 'anthropic' };
  if (status === 400 && message.includes('safety')) return { type: 'content_policy', message, retryable: false, httpStatus: status, providerId: 'anthropic' };
  if (status >= 500) return { type: 'server', message, retryable: true, retryAfterMs: 2000, httpStatus: status, providerId: 'anthropic' };
  return { type: 'unknown', message, retryable: false, httpStatus: status, providerId: 'anthropic' };
}

export const anthropicAdapter: ProviderAdapter = {
  providerId: 'anthropic',

  async *stream(apiKey: string, request: StreamRequest): AsyncGenerator<NormalizedStreamEvent, void, undefined> {
    const baseUrl = PROVIDER_META.anthropic.baseUrl;
    const { system, messages } = buildMessages(request.messages, request.attachments);

    const body: Record<string, unknown> = {
      model: request.model,
      messages,
      max_tokens: request.parameters.maxOutputTokens ?? 4096,
      stream: true,
    };

    // Web search — Anthropic web search tool (beta)
    if (request.webSearchEnabled) {
      body.tools = [
        ...(body.tools as Array<Record<string, unknown>> ?? []),
        { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
      ];
    }

    if (system) body.system = system;
    if (request.parameters.temperature !== null) body.temperature = request.parameters.temperature;
    if (request.parameters.topP !== null) body.top_p = request.parameters.topP;
    if (request.parameters.topK !== null) body.top_k = request.parameters.topK;
    if (request.parameters.stopSequences.length > 0) body.stop_sequences = request.parameters.stopSequences;

    // Extended thinking
    if (request.parameters.thinkingEnabled) {
      const budgetMap = { low: 2048, medium: 8192, high: 32768 } as const;
      body.thinking = {
        type: 'enabled',
        budget_tokens: budgetMap[request.parameters.thinkingLevel] ?? 8192,
      };
      body.temperature = 1;
    }

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
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

    // Tool use accumulation
    let currentToolUseId = '';
    let currentToolUseName = '';
    let currentToolUseArgs = '';
    let inToolUse = false;

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
          let parsed: Record<string, unknown>;
          try { parsed = JSON.parse(data); } catch { continue; }

          const eventType = parsed.type as string;

          switch (eventType) {
            case 'content_block_start': {
              const block = parsed.content_block as Record<string, unknown>;
              const blockType = block?.type as string;

              if (blockType === 'tool_use') {
                inToolUse = true;
                currentToolUseId = (block.id as string) ?? '';
                currentToolUseName = (block.name as string) ?? '';
                currentToolUseArgs = '';
              }
              break;
            }

            case 'content_block_delta': {
              const delta = parsed.delta as Record<string, unknown>;
              if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
                yield { type: 'delta_text', content: delta.text };
              }
              if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') {
                yield { type: 'delta_thinking', content: delta.thinking };
              }
              // Tool use input accumulation
              if (delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
                currentToolUseArgs += delta.partial_json;
              }
              break;
            }

            case 'content_block_stop': {
              if (inToolUse) {
                let parsedArgs: Record<string, unknown> = {};
                try { parsedArgs = JSON.parse(currentToolUseArgs); } catch { /* keep empty */ }
                yield {
                  type: 'tool_call',
                  toolCall: {
                    id: currentToolUseId,
                    toolName: currentToolUseName,
                    arguments: parsedArgs,
                    status: 'pending_approval',
                  },
                };
                inToolUse = false;
                currentToolUseId = '';
                currentToolUseName = '';
                currentToolUseArgs = '';
              }
              break;
            }

            case 'message_delta': {
              const usageObj = parsed.usage as Record<string, number> | undefined;
              if (usageObj) {
                yield {
                  type: 'usage',
                  usage: {
                    inputTokens: usageObj.input_tokens ?? 0,
                    outputTokens: usageObj.output_tokens ?? 0,
                    thinkingTokens: 0,
                    cachedTokens: 0,
                    totalTokens: (usageObj.input_tokens ?? 0) + (usageObj.output_tokens ?? 0),
                  },
                };
              }
              break;
            }

            case 'message_start': {
              const msg = parsed.message as Record<string, unknown> | undefined;
              const startUsage = msg?.usage as Record<string, number> | undefined;
              if (startUsage) {
                yield {
                  type: 'usage',
                  usage: {
                    inputTokens: startUsage.input_tokens ?? 0,
                    outputTokens: 0,
                    thinkingTokens: 0,
                    cachedTokens: startUsage.cache_read_input_tokens ?? 0,
                    totalTokens: startUsage.input_tokens ?? 0,
                  },
                };
              }
              break;
            }

            case 'message_stop':
              yield { type: 'message_end' };
              return;

            case 'error': {
              const err = parsed.error as Record<string, string> | undefined;
              yield {
                type: 'error',
                error: {
                  type: 'server',
                  message: err?.message ?? 'Stream error',
                  retryable: true,
                  providerId: 'anthropic',
                },
              };
              return;
            }
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
      const response = await fetch(`${PROVIDER_META.anthropic.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      });
      return response.status !== 401;
    } catch {
      return false;
    }
  },
};

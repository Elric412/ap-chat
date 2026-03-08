/**
 * OpenAI-Compatible Adapter Factory
 * 
 * Mistral, Groq, Together AI, and Ollama all expose OpenAI-compatible
 * /chat/completions endpoints. This factory creates a ProviderAdapter
 * with correct headers, error classification, and key validation for each.
 */

import type { ProviderAdapter, StreamRequest, StreamMessage } from '../types';
import type { NormalizedStreamEvent, ClassifiedError } from '../../types/adapters';
import type { ProviderId } from '../../types/models';
import type { ProcessedAttachment } from '../../engine/attachment-processor';
import { buildMultimodalContent } from '../../engine/attachment-processor';

interface OpenAICompatConfig {
  providerId: ProviderId;
  baseUrl: string;
  /** Build the Authorization header value from the API key */
  authHeader: (key: string) => Record<string, string>;
  /** Extra body fields to inject (e.g. safe_prompt for Mistral) */
  extraBody?: Record<string, unknown>;
  /** Whether this provider supports vision/multimodal */
  supportsVision?: boolean;
  /** Custom validation endpoint — defaults to /models */
  validatePath?: string;
  /** Skip key validation entirely (e.g. Ollama has no auth) */
  skipValidation?: boolean;
}

function buildMessages(
  messages: StreamMessage[],
  attachments: ProcessedAttachment[] | undefined,
  supportsVision: boolean,
): Array<Record<string, unknown>> {
  return messages.map((msg, i) => {
    const textParts = msg.content.filter((p) => p.type === 'text');
    const text = textParts.map((p) => (p as { type: 'text'; text: string }).text).join('\n');

    if (msg.role === 'tool' && msg.toolCallId) {
      return { role: 'tool', tool_call_id: msg.toolCallId, content: text };
    }

    const isLastUser = msg.role === 'user' && i === messages.length - 1;
    if (isLastUser && attachments?.length && supportsVision) {
      const parts = buildMultimodalContent(text, attachments);
      return { role: 'user', content: parts };
    }

    return { role: msg.role, content: text };
  });
}

function classifyError(status: number, body: string, providerId: ProviderId): ClassifiedError {
  const parsed = (() => { try { return JSON.parse(body); } catch { return null; } })();
  const message = parsed?.error?.message ?? parsed?.message ?? body;

  if (status === 401 || status === 403) return { type: 'auth', message, retryable: false, httpStatus: status, providerId };
  if (status === 429) return { type: 'rate_limit', message, retryable: true, retryAfterMs: 5000, httpStatus: status, providerId };
  if (status === 402) return { type: 'quota', message, retryable: false, httpStatus: status, providerId };
  if (status === 400 && (message.includes('context') || message.includes('token'))) return { type: 'context_overflow', message, retryable: false, httpStatus: status, providerId };
  if (status === 400 && message.includes('safety')) return { type: 'content_policy', message, retryable: false, httpStatus: status, providerId };
  if (status >= 500) return { type: 'server', message, retryable: true, retryAfterMs: 2000, httpStatus: status, providerId };
  return { type: 'unknown', message, retryable: false, httpStatus: status, providerId };
}

export function createOpenAICompatAdapter(config: OpenAICompatConfig): ProviderAdapter {
  const {
    providerId,
    baseUrl,
    authHeader,
    extraBody = {},
    supportsVision = false,
    validatePath = '/models',
    skipValidation = false,
  } = config;

  return {
    providerId,

    async *stream(apiKey: string, request: StreamRequest): AsyncGenerator<NormalizedStreamEvent, void, undefined> {
      const body: Record<string, unknown> = {
        model: request.model,
        messages: buildMessages(request.messages, request.attachments, supportsVision),
        stream: true,
        ...extraBody,
      };

      if (request.parameters.temperature !== null) body.temperature = request.parameters.temperature;
      if (request.parameters.topP !== null) body.top_p = request.parameters.topP;
      if (request.parameters.maxOutputTokens !== null) body.max_tokens = request.parameters.maxOutputTokens;
      if (request.parameters.frequencyPenalty !== null) body.frequency_penalty = request.parameters.frequencyPenalty;
      if (request.parameters.presencePenalty !== null) body.presence_penalty = request.parameters.presencePenalty;
      if (request.parameters.stopSequences.length > 0) body.stop = request.parameters.stopSequences;
      if (request.parameters.responseFormat === 'json') body.response_format = { type: 'json_object' };
      if (request.parameters.seed !== null) body.seed = request.parameters.seed;

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader(apiKey),
        },
        body: JSON.stringify(body),
        signal: request.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        yield { type: 'error', error: classifyError(response.status, errorBody, providerId) };
        return;
      }

      yield { type: 'message_start' };

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
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
              for (const [, tc] of pendingToolCalls) {
                let parsedArgs: Record<string, unknown> = {};
                try { parsedArgs = JSON.parse(tc.args); } catch { /* keep empty */ }
                yield {
                  type: 'tool_call',
                  toolCall: { id: tc.id, toolName: tc.name, arguments: parsedArgs, status: 'pending_approval' },
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

              if (delta?.content && typeof delta.content === 'string') {
                yield { type: 'delta_text', content: delta.content };
              }

              if (delta?.reasoning_content && typeof delta.reasoning_content === 'string') {
                yield { type: 'delta_thinking', content: delta.reasoning_content };
              }

              const toolCalls = delta?.tool_calls as Array<Record<string, unknown>> | undefined;
              if (toolCalls) {
                for (const tc of toolCalls) {
                  const index = tc.index as number;
                  const fnObj = tc.function as Record<string, unknown> | undefined;
                  if (!pendingToolCalls.has(index)) {
                    pendingToolCalls.set(index, { id: (tc.id as string) ?? '', name: (fnObj?.name as string) ?? '', args: '' });
                  }
                  const existing = pendingToolCalls.get(index)!;
                  if (tc.id && typeof tc.id === 'string') existing.id = tc.id;
                  if (fnObj?.name && typeof fnObj.name === 'string') existing.name = fnObj.name;
                  if (fnObj?.arguments && typeof fnObj.arguments === 'string') existing.args += fnObj.arguments;
                }
              }
            }

            const usage = parsed.usage as Record<string, number> | undefined;
            if (usage) {
              yield {
                type: 'usage',
                usage: {
                  inputTokens: usage.prompt_tokens ?? 0,
                  outputTokens: usage.completion_tokens ?? 0,
                  thinkingTokens: 0,
                  cachedTokens: 0,
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
      if (skipValidation) return true;
      try {
        const response = await fetch(`${baseUrl}${validatePath}`, {
          headers: authHeader(apiKey),
        });
        return response.ok || response.status !== 401;
      } catch {
        return false;
      }
    },
  };
}

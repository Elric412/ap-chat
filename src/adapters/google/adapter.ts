/**
 * Google Gemini Provider Adapter
 * 
 * Streams completions from the Gemini REST API using SSE.
 * Handles thinking blocks, grounding/search results, and function calls.
 */

import type { ProviderAdapter, StreamRequest, StreamMessage } from '../types';
import type { NormalizedStreamEvent, ClassifiedError } from '../../types/adapters';
import { PROVIDER_META } from '../../constants/provider-meta';

function buildContents(messages: StreamMessage[]): {
  systemInstruction?: Record<string, unknown>;
  contents: Array<Record<string, unknown>>;
} {
  let systemInstruction: Record<string, unknown> | undefined;
  const contents: Array<Record<string, unknown>> = [];

  for (const msg of messages) {
    const textParts = msg.content.filter((p) => p.type === 'text');
    const text = textParts.map((p) => (p as { type: 'text'; text: string }).text).join('\n');

    if (msg.role === 'system') {
      systemInstruction = { parts: [{ text }] };
      continue;
    }

    const role = msg.role === 'assistant' ? 'model' : 'user';
    contents.push({ role, parts: [{ text }] });
  }

  return { systemInstruction, contents };
}

function classifyError(status: number, body: string): ClassifiedError {
  const parsed = (() => { try { return JSON.parse(body); } catch { return null; } })();
  const message = parsed?.error?.message ?? body;

  if (status === 400 && message.includes('API key')) return { type: 'auth', message, retryable: false, httpStatus: status, providerId: 'google' };
  if (status === 403) return { type: 'auth', message, retryable: false, httpStatus: status, providerId: 'google' };
  if (status === 429) return { type: 'rate_limit', message, retryable: true, retryAfterMs: 5000, httpStatus: status, providerId: 'google' };
  if (status >= 500) return { type: 'server', message, retryable: true, retryAfterMs: 2000, httpStatus: status, providerId: 'google' };
  return { type: 'unknown', message, retryable: false, httpStatus: status, providerId: 'google' };
}

export const googleAdapter: ProviderAdapter = {
  providerId: 'google',

  async *stream(apiKey: string, request: StreamRequest): AsyncGenerator<NormalizedStreamEvent, void, undefined> {
    const baseUrl = PROVIDER_META.google.baseUrl;
    const { systemInstruction, contents } = buildContents(request.messages);

    const body: Record<string, unknown> = { contents };

    if (systemInstruction) body.systemInstruction = systemInstruction;

    const generationConfig: Record<string, unknown> = {};
    if (request.parameters.temperature !== null) generationConfig.temperature = request.parameters.temperature;
    if (request.parameters.topP !== null) generationConfig.topP = request.parameters.topP;
    if (request.parameters.topK !== null) generationConfig.topK = request.parameters.topK;
    if (request.parameters.maxOutputTokens !== null) generationConfig.maxOutputTokens = request.parameters.maxOutputTokens;
    if (request.parameters.stopSequences.length > 0) generationConfig.stopSequences = request.parameters.stopSequences;
    if (request.parameters.presencePenalty !== null) generationConfig.presencePenalty = request.parameters.presencePenalty;
    if (request.parameters.responseFormat === 'json') generationConfig.responseMimeType = 'application/json';

    // Thinking
    if (request.parameters.thinkingEnabled) {
      const budgetMap = { low: 2048, medium: 8192, high: 32768 } as const;
      generationConfig.thinkingConfig = {
        thinkingBudget: budgetMap[request.parameters.thinkingLevel] ?? 8192,
      };
    }

    if (Object.keys(generationConfig).length > 0) {
      body.generationConfig = generationConfig;
    }

    const url = `${baseUrl}/v1beta/models/${request.model}:streamGenerateContent?key=${apiKey}&alt=sse`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    let totalThinkingTokens = 0;

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
          let parsed: Record<string, unknown>;
          try { parsed = JSON.parse(data); } catch { continue; }

          const candidates = parsed.candidates as Array<Record<string, unknown>> | undefined;
          if (candidates?.[0]) {
            const candidate = candidates[0];
            const content = candidate.content as Record<string, unknown> | undefined;
            const parts = content?.parts as Array<Record<string, unknown>> | undefined;

            if (parts) {
              for (const part of parts) {
                // Text content
                if (typeof part.text === 'string') {
                  if (part.thought === true) {
                    yield { type: 'delta_thinking', content: part.text };
                  } else {
                    yield { type: 'delta_text', content: part.text };
                  }
                }

                // Function calls
                const fnCall = part.functionCall as Record<string, unknown> | undefined;
                if (fnCall) {
                  yield {
                    type: 'tool_call',
                    toolCall: {
                      id: (fnCall.name as string) ?? '',
                      toolName: (fnCall.name as string) ?? '',
                      arguments: (fnCall.args as Record<string, unknown>) ?? {},
                      status: 'pending_approval',
                    },
                  };
                }
              }
            }

            // Grounding metadata — extract search citations
            const groundingMeta = candidate.groundingMetadata as Record<string, unknown> | undefined;
            if (groundingMeta) {
              const chunks = groundingMeta.groundingChunks as Array<Record<string, unknown>> | undefined;
              if (chunks) {
                for (const chunk of chunks) {
                  const web = chunk.web as Record<string, unknown> | undefined;
                  if (web?.uri) {
                    yield {
                      type: 'citation',
                      citation: {
                        url: web.uri as string,
                        title: (web.title as string) ?? '',
                        snippet: '',
                        source: web.uri as string,
                        fetchedAt: Date.now(),
                      },
                    };
                  }
                }
              }

              // Search entry point (rendered as search suggestion in grounding)
              const searchEntryPoint = groundingMeta.searchEntryPoint as Record<string, unknown> | undefined;
              if (searchEntryPoint?.renderedContent) {
                // We note the search was performed but don't render the HTML
              }
            }
          }

          // Usage metadata
          const usageMeta = parsed.usageMetadata as Record<string, number> | undefined;
          if (usageMeta) {
            totalInputTokens = usageMeta.promptTokenCount ?? totalInputTokens;
            totalOutputTokens = usageMeta.candidatesTokenCount ?? totalOutputTokens;
            totalThinkingTokens = usageMeta.thoughtsTokenCount ?? totalThinkingTokens;
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
          thinkingTokens: totalThinkingTokens,
          cachedTokens: 0,
          totalTokens: totalInputTokens + totalOutputTokens + totalThinkingTokens,
        },
      };
    }

    yield { type: 'message_end' };
  },

  async validateKey(apiKey: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${PROVIDER_META.google.baseUrl}/v1beta/models?key=${apiKey}`
      );
      return response.ok;
    } catch {
      return false;
    }
  },
};

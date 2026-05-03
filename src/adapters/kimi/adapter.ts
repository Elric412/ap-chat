/**
 * Kimi Provider Adapter
 *
 * Kimi/Moonshot exposes two distinct OpenAI-compatible API surfaces, each
 * scoped to its own API key prefix:
 *
 *   • Moonshot Platform (general models — kimi-k2, moonshot-v1-*):
 *       https://api.moonshot.ai/v1     — keys begin with `sk-` (NOT `sk-kimi-`)
 *
 *   • Kimi for Coding (coding-specialized — kimi-for-coding):
 *       https://api.moonshot.cn/v1     — keys begin with `sk-kimi-`
 *
 * The adapter inspects the key prefix at runtime and dispatches the request
 * to the correct base URL. This is required because both endpoints reject
 * keys minted for the other surface with HTTP 401 "Invalid Authentication".
 */

import type { ProviderAdapter, StreamRequest } from '../types';
import type { NormalizedStreamEvent } from '../../types/adapters';
import { createOpenAICompatAdapter } from '../openai-compat/create-adapter';

const PLATFORM_BASE_URL = 'https://api.moonshot.ai/v1';
const CODING_BASE_URL = 'https://api.moonshot.cn/v1';

function resolveBaseUrl(apiKey: string): string {
  // Coding-tier keys are prefixed `sk-kimi-` and must go to moonshot.cn.
  return apiKey.startsWith('sk-kimi-') ? CODING_BASE_URL : PLATFORM_BASE_URL;
}

function buildAdapter(baseUrl: string): ProviderAdapter {
  return createOpenAICompatAdapter({
    providerId: 'kimi',
    baseUrl,
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    supportsVision: false,
  });
}

// Cache adapters by base URL so we don't recreate per request.
const adapterCache = new Map<string, ProviderAdapter>();
function getAdapter(apiKey: string): ProviderAdapter {
  const url = resolveBaseUrl(apiKey);
  let adapter = adapterCache.get(url);
  if (!adapter) {
    adapter = buildAdapter(url);
    adapterCache.set(url, adapter);
  }
  return adapter;
}

export const kimiAdapter: ProviderAdapter = {
  providerId: 'kimi',

  async *stream(apiKey: string, request: StreamRequest): AsyncGenerator<NormalizedStreamEvent, void, undefined> {
    yield* getAdapter(apiKey).stream(apiKey, request);
  },

  async validateKey(apiKey: string): Promise<boolean> {
    return getAdapter(apiKey).validateKey(apiKey);
  },
};

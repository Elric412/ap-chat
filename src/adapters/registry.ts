/**
 * Adapter Registry
 * 
 * Maps ProviderId to its adapter implementation.
 * Single lookup point for all 8 provider adapters.
 */

import type { ProviderAdapter } from './types';
import type { ProviderId } from '../types/models';
import { openaiAdapter } from './openai/adapter';
import { anthropicAdapter } from './anthropic/adapter';
import { googleAdapter } from './google/adapter';
import { mistralAdapter } from './mistral/adapter';
import { groqAdapter } from './groq/adapter';
import { cohereAdapter } from './cohere/adapter';
import { togetherAdapter } from './together/adapter';
import { ollamaAdapter } from './ollama/adapter';

const ADAPTER_MAP: Record<ProviderId, ProviderAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  google: googleAdapter,
  mistral: mistralAdapter,
  groq: groqAdapter,
  cohere: cohereAdapter,
  together: togetherAdapter,
  ollama: ollamaAdapter,
};

export function getAdapter(providerId: ProviderId): ProviderAdapter {
  return ADAPTER_MAP[providerId];
}

export function getAvailableProviders(): ProviderId[] {
  return Object.keys(ADAPTER_MAP) as ProviderId[];
}

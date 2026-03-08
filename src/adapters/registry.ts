/**
 * Adapter Registry
 * 
 * Maps ProviderId to its adapter implementation.
 * Single lookup point for all provider adapters.
 */

import type { ProviderAdapter } from './types';
import type { ProviderId } from '../types/models';
import { openaiAdapter } from './openai/adapter';
import { anthropicAdapter } from './anthropic/adapter';
import { googleAdapter } from './google/adapter';

const ADAPTER_MAP: Partial<Record<ProviderId, ProviderAdapter>> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  google: googleAdapter,
};

export function getAdapter(providerId: ProviderId): ProviderAdapter | null {
  return ADAPTER_MAP[providerId] ?? null;
}

export function getAvailableProviders(): ProviderId[] {
  return Object.keys(ADAPTER_MAP) as ProviderId[];
}

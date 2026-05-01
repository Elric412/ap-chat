/**
 * Kimi Provider Adapter
 *
 * OpenAI-compatible endpoint at https://api.kimi.com/coding/v1
 * Hosts the Kimi K2.6 Code model optimized for software engineering tasks.
 */

import { createOpenAICompatAdapter } from '../openai-compat/create-adapter';
import { PROVIDER_META } from '../../constants/provider-meta';

export const kimiAdapter = createOpenAICompatAdapter({
  providerId: 'kimi',
  baseUrl: PROVIDER_META.kimi.baseUrl,
  authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
  supportsVision: false,
});

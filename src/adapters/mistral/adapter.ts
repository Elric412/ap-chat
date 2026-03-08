/**
 * Mistral Provider Adapter
 * 
 * Uses OpenAI-compatible /chat/completions endpoint.
 * Supports function calling, JSON mode, and safe_prompt.
 */

import { createOpenAICompatAdapter } from '../openai-compat/create-adapter';
import { PROVIDER_META } from '../../constants/provider-meta';

export const mistralAdapter = createOpenAICompatAdapter({
  providerId: 'mistral',
  baseUrl: PROVIDER_META.mistral.baseUrl,
  authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
  supportsVision: true,
});

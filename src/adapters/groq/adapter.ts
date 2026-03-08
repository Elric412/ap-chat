/**
 * Groq Provider Adapter
 * 
 * Uses OpenAI-compatible API with ultra-low latency inference.
 * Supports LPU-accelerated models (Llama, Mixtral, Gemma).
 */

import { createOpenAICompatAdapter } from '../openai-compat/create-adapter';
import { PROVIDER_META } from '../../constants/provider-meta';

export const groqAdapter = createOpenAICompatAdapter({
  providerId: 'groq',
  baseUrl: PROVIDER_META.groq.baseUrl,
  authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
  supportsVision: true,
});

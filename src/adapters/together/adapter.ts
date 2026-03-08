/**
 * Together AI Provider Adapter
 * 
 * OpenAI-compatible API for open-source model hosting.
 * Supports Llama, Qwen, DeepSeek, Mixtral and more.
 */

import { createOpenAICompatAdapter } from '../openai-compat/create-adapter';
import { PROVIDER_META } from '../../constants/provider-meta';

export const togetherAdapter = createOpenAICompatAdapter({
  providerId: 'together',
  baseUrl: PROVIDER_META.together.baseUrl,
  authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
  supportsVision: true,
});

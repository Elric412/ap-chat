/**
 * Ollama Provider Adapter
 * 
 * Local inference via Ollama's OpenAI-compatible API.
 * No authentication required. Base URL configurable.
 */

import { createOpenAICompatAdapter } from '../openai-compat/create-adapter';
import { PROVIDER_META } from '../../constants/provider-meta';

export const ollamaAdapter = createOpenAICompatAdapter({
  providerId: 'ollama',
  baseUrl: `${PROVIDER_META.ollama.baseUrl}/v1`,
  authHeader: () => ({}),
  skipValidation: true,
});

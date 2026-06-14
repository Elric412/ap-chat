/**
 * OpenRouter Provider Adapter
 *
 * OpenAI-compatible API exposing routed access to many model providers.
 * Keys are prefixed `sk-or-`. Includes recommended HTTP-Referer/X-Title
 * headers for attribution on OpenRouter dashboards.
 */

import { createOpenAICompatAdapter } from '../openai-compat/create-adapter';
import { PROVIDER_META } from '../../constants/provider-meta';

export const openrouterAdapter = createOpenAICompatAdapter({
  providerId: 'openrouter',
  baseUrl: PROVIDER_META.openrouter.baseUrl,
  authHeader: (key) => ({
    Authorization: `Bearer ${key}`,
    'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://ap-chat.lovable.app',
    'X-Title': 'AP Chat',
  }),
  supportsVision: true,
});

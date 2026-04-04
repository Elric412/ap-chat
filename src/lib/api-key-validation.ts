import { PROVIDER_META } from '../constants/provider-meta';
import { PROVIDER_IDS, type ProviderId } from '../types/models';

const MAX_API_KEY_LENGTH = 500;

export interface ApiKeyValidationResult {
  valid: boolean;
  sanitizedKey: string;
  error?: string;
}

function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 32 || code === 127) {
      return true;
    }
  }
  return false;
}

function isPrintableAscii(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 32 || code > 126) {
      return false;
    }
  }
  return true;
}

export function validateApiKeyInput(key: string, providerId: ProviderId): ApiKeyValidationResult {
  const sanitizedKey = key.trim();

  if (!sanitizedKey) {
    return { valid: false, sanitizedKey, error: 'API key cannot be empty' };
  }

  if (sanitizedKey.length > MAX_API_KEY_LENGTH) {
    return { valid: false, sanitizedKey, error: `API key is too long (max ${MAX_API_KEY_LENGTH} characters)` };
  }

  if (hasControlCharacters(sanitizedKey)) {
    return { valid: false, sanitizedKey, error: 'API key contains invalid control characters' };
  }

  if (!isPrintableAscii(sanitizedKey)) {
    return { valid: false, sanitizedKey, error: 'API key must use printable ASCII characters only' };
  }

  const meta = PROVIDER_META[providerId];

  if (providerId !== PROVIDER_IDS.ollama && !meta.keyPattern.test(sanitizedKey)) {
    return {
      valid: false,
      sanitizedKey,
      error: `Key format does not match expected pattern for ${meta.displayName}`,
    };
  }

  return { valid: true, sanitizedKey };
}

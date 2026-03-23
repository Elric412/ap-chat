/**
 * Input Sanitizer — Validates and sanitizes user inputs at system boundaries.
 * 
 * Per ECC security-reviewer: validate all user input at system boundaries,
 * use schema-based validation, fail fast with clear messages.
 */

/** Maximum allowed message length */
export const MAX_MESSAGE_LENGTH = 100_000;

/** Maximum allowed attachment count */
export const MAX_ATTACHMENTS = 10;

/** Sanitize user message text before sending to API */
export function sanitizeMessageText(text: string): { valid: boolean; sanitized: string; error?: string } {
  if (!text || typeof text !== 'string') {
    return { valid: false, sanitized: '', error: 'Message must be a non-empty string' };
  }

  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return { valid: false, sanitized: '', error: 'Message cannot be empty' };
  }

  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return { valid: false, sanitized: '', error: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters` };
  }

  // Strip null bytes (potential injection vector)
  const sanitized = trimmed.replace(/\0/g, '');

  return { valid: true, sanitized };
}

/** Sanitize error messages to prevent leaking sensitive info */
export function sanitizeErrorMessage(rawError: string): string {
  // Strip potential API keys from error messages (common pattern: sk-xxx, key-xxx, etc.)
  let safe = rawError.replace(/\b(sk|key|api|token|bearer|auth)[-_]?[a-zA-Z0-9]{8,}\b/gi, '[REDACTED]');

  // Strip URLs that may contain auth params
  safe = safe.replace(/https?:\/\/[^\s]*[?&](key|token|api_key|auth)=[^\s&]*/gi, '[URL_REDACTED]');

  // Truncate overly long error messages
  if (safe.length > 500) {
    safe = safe.slice(0, 497) + '…';
  }

  return safe;
}

/** Validate a conversation title */
export function sanitizeTitle(title: string): string {
  if (!title || typeof title !== 'string') return 'Untitled';
  return title.trim().slice(0, 200).replace(/\0/g, '') || 'Untitled';
}

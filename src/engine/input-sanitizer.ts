/**
 * Input Sanitizer — Validates and sanitizes user inputs at system boundaries.
 * 
 * Per ECC security-reviewer & coding-standards skills:
 *   - Validate all user input at system boundaries
 *   - Schema-based validation, fail fast with clear messages
 *   - Never trust external data (API responses, user input, file content)
 * 
 * Per api-security-best-practices skill:
 *   - Sanitize error messages (no data leaks)
 *   - Strip potential injection vectors (null bytes, control chars)
 *   - Length-limit all outputs
 */

/** Maximum allowed message length */
export const MAX_MESSAGE_LENGTH = 100_000;

/** Maximum allowed attachment count */
export const MAX_ATTACHMENTS = 10;

/** Maximum allowed conversation title length */
export const MAX_TITLE_LENGTH = 200;

/** Maximum allowed system prompt length */
export const MAX_SYSTEM_PROMPT_LENGTH = 50_000;

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
    return { valid: false, sanitized: '', error: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH.toLocaleString()} characters` };
  }

  // Strip null bytes and other control characters (potential injection vectors)
  const sanitized = trimmed.replace(/[\0\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return { valid: true, sanitized };
}

/**
 * Redaction patterns for sensitive data that may appear in error messages.
 * Order matters — more specific patterns first.
 */
const REDACTION_PATTERNS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  // Bearer tokens
  { pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, replacement: 'Bearer [REDACTED]' },
  // API keys with common prefixes (sk-, key-, api-, etc.)
  { pattern: /\b(sk|key|api|token|auth|secret|password|credential)[-_]?[a-zA-Z0-9]{8,}\b/gi, replacement: '[REDACTED]' },
  // JWT tokens (three dot-separated base64 segments)
  { pattern: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, replacement: '[JWT_REDACTED]' },
  // URLs with auth-related query params
  { pattern: /https?:\/\/[^\s]*[?&](key|token|api_key|auth|secret|password|credential)=[^\s&]*/gi, replacement: '[URL_REDACTED]' },
  // Email addresses (potential PII)
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL_REDACTED]' },
];

/** Sanitize error messages to prevent leaking sensitive info */
export function sanitizeErrorMessage(rawError: string): string {
  let safe = rawError;

  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    safe = safe.replace(pattern, replacement);
  }

  // Truncate overly long error messages
  if (safe.length > 500) {
    safe = safe.slice(0, 497) + '…';
  }

  return safe;
}

/** Validate a conversation title */
export function sanitizeTitle(title: string): string {
  if (!title || typeof title !== 'string') return 'Untitled';
  return title
    .trim()
    .slice(0, MAX_TITLE_LENGTH)
    .replace(/[\0\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    || 'Untitled';
}

/** Validate a system prompt */
export function sanitizeSystemPrompt(prompt: string): { valid: boolean; sanitized: string; error?: string } {
  if (!prompt || typeof prompt !== 'string') {
    return { valid: false, sanitized: '', error: 'System prompt must be a string' };
  }

  const trimmed = prompt.trim();

  if (trimmed.length > MAX_SYSTEM_PROMPT_LENGTH) {
    return { valid: false, sanitized: '', error: `System prompt exceeds ${MAX_SYSTEM_PROMPT_LENGTH.toLocaleString()} characters` };
  }

  const sanitized = trimmed.replace(/\0/g, '');
  return { valid: true, sanitized };
}

/**
 * Validate attachment count.
 * Per production-code-audit: validate at system boundaries, fail fast.
 */
export function validateAttachmentCount(count: number): { valid: boolean; error?: string } {
  if (count > MAX_ATTACHMENTS) {
    return { valid: false, error: `Maximum ${MAX_ATTACHMENTS} attachments allowed` };
  }
  return { valid: true };
}

const FALLBACK_BASENAME = 'conversation';
const MAX_BASENAME_LENGTH = 80;
const CONTROL_CHAR_BOUNDARY = 0x1f;

const RESERVED_WINDOWS_BASENAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

/**
 * Produce a cross-platform safe filename basename.
 * - strips path separators and control chars
 * - normalizes unicode and separators
 * - trims/compacts whitespace
 * - avoids reserved DOS device names
 * - enforces max length while preserving readability
 */
export function toSafeFilename(input: string, fallback = FALLBACK_BASENAME): string {
  if (!input) return fallback;

  const strippedControlChars = Array.from(input)
    .filter((char) => char.charCodeAt(0) > CONTROL_CHAR_BOUNDARY)
    .join('');

  const normalized = strippedControlChars
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return fallback;

  let safe = normalized.replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!safe) return fallback;

  if (safe.length > MAX_BASENAME_LENGTH) {
    safe = safe.slice(0, MAX_BASENAME_LENGTH).replace(/-+$/g, '');
  }

  if (RESERVED_WINDOWS_BASENAMES.has(safe.toUpperCase())) {
    safe = `${safe}-file`;
  }

  return safe || fallback;
}

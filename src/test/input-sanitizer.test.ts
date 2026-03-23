/**
 * Input Sanitizer Tests — Per ECC tdd-guide: tests for all security boundaries.
 */

import { describe, it, expect } from 'vitest';
import { sanitizeMessageText, sanitizeErrorMessage, sanitizeTitle } from '../engine/input-sanitizer';

describe('sanitizeMessageText', () => {
  it('accepts valid text', () => {
    const result = sanitizeMessageText('Hello world');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('Hello world');
  });

  it('rejects empty string', () => {
    expect(sanitizeMessageText('').valid).toBe(false);
    expect(sanitizeMessageText('   ').valid).toBe(false);
  });

  it('rejects overly long messages', () => {
    const long = 'a'.repeat(100_001);
    expect(sanitizeMessageText(long).valid).toBe(false);
  });

  it('strips null bytes', () => {
    const result = sanitizeMessageText('hello\0world');
    expect(result.sanitized).toBe('helloworld');
  });

  it('rejects non-string inputs', () => {
    expect(sanitizeMessageText(null as any).valid).toBe(false);
    expect(sanitizeMessageText(undefined as any).valid).toBe(false);
  });
});

describe('sanitizeErrorMessage', () => {
  it('redacts API keys from errors', () => {
    const raw = 'Invalid API key: sk-abc123456789xyz';
    const safe = sanitizeErrorMessage(raw);
    expect(safe).not.toContain('sk-abc123456789xyz');
    expect(safe).toContain('[REDACTED]');
  });

  it('redacts auth params from URLs', () => {
    const raw = 'Error at https://api.example.com/v1?api_key=secret123&model=gpt-4';
    const safe = sanitizeErrorMessage(raw);
    expect(safe).not.toContain('secret123');
  });

  it('truncates long error messages', () => {
    const raw = 'x'.repeat(1000);
    const safe = sanitizeErrorMessage(raw);
    expect(safe.length).toBeLessThanOrEqual(500);
  });

  it('passes through clean errors', () => {
    const msg = 'Network timeout after 30s';
    expect(sanitizeErrorMessage(msg)).toBe(msg);
  });
});

describe('sanitizeTitle', () => {
  it('returns trimmed title', () => {
    expect(sanitizeTitle('  My Chat  ')).toBe('My Chat');
  });

  it('truncates long titles', () => {
    expect(sanitizeTitle('a'.repeat(300)).length).toBeLessThanOrEqual(200);
  });

  it('returns default for empty/null', () => {
    expect(sanitizeTitle('')).toBe('Untitled');
    expect(sanitizeTitle(null as any)).toBe('Untitled');
  });
});

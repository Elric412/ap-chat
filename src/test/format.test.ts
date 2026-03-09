import { describe, expect, it, vi } from 'vitest';
import {
  formatCost,
  formatLatency,
  formatRelativeTime,
  formatTime,
  formatTokenCount,
  formatTokens,
} from '@/lib/format';

describe('format helpers', () => {
  it('formats token counts across ranges', () => {
    expect(formatTokens(999)).toBe('999');
    expect(formatTokens(1500)).toBe('1.5K');
    expect(formatTokenCount(2_500_000)).toBe('2.5M');
  });

  it('formats costs with precision rules', () => {
    expect(formatCost(0.0005)).toBe('<$0.001');
    expect(formatCost(0.1234)).toBe('$0.1234');
    expect(formatCost(12.3456)).toBe('$12.35');
  });

  it('formats latency in ms and seconds', () => {
    expect(formatLatency(42.1)).toBe('42ms');
    expect(formatLatency(1550)).toBe('1.6s');
  });

  it('formats fixed time output', () => {
    const date = new Date('2026-01-01T13:05:00Z');
    expect(formatTime(date)).toMatch(/^\d{2}:\d{2}$/);
  });

  it('formats relative time by mocked now', () => {
    const now = new Date('2026-03-09T00:00:00Z').valueOf();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    expect(formatRelativeTime(now + 30_000)).toBe('in 30 seconds');
    expect(formatRelativeTime(now - 2 * 60_000)).toBe('2 minutes ago');
    expect(formatRelativeTime(now + 3 * 60 * 60_000)).toBe('in 3 hours');
  });
});

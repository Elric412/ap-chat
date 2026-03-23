/**
 * Resilience Tests — Per ECC tdd-guide: test infrastructure primitives.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker, CircuitOpenError, withRetry, Bulkhead, TimeoutError, withTimeout } from '../engine/resilience';

describe('CircuitBreaker', () => {
  it('starts in closed state', () => {
    const cb = new CircuitBreaker();
    expect(cb.currentState).toBe('closed');
  });

  it('opens after threshold failures', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, recoveryTimeout: 10_000 });
    const fail = async () => { throw new Error('fail'); };
    await expect(cb.execute(fail)).rejects.toThrow();
    await expect(cb.execute(fail)).rejects.toThrow();
    expect(cb.currentState).toBe('open');
    await expect(cb.execute(fail)).rejects.toThrow(CircuitOpenError);
  });

  it('resets on manual reset', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1 });
    await expect(cb.execute(async () => { throw new Error(); })).rejects.toThrow();
    expect(cb.currentState).toBe('open');
    cb.reset();
    expect(cb.currentState).toBe('closed');
  });

  it('passes through on success', async () => {
    const cb = new CircuitBreaker();
    const result = await cb.execute(async () => 42);
    expect(result).toBe(42);
  });
});

describe('withRetry', () => {
  it('succeeds on first try', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxRetries: 3 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure then succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail1'))
      .mockResolvedValue('ok');
    const result = await withRetry(fn, { maxRetries: 3, baseDelay: 10 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistent'));
    await expect(withRetry(fn, { maxRetries: 2, baseDelay: 10 })).rejects.toThrow('persistent');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('respects retryIf predicate', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('no-retry'));
    await expect(withRetry(fn, { maxRetries: 3, retryIf: () => false })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('Bulkhead', () => {
  it('limits concurrency', async () => {
    const bh = new Bulkhead(2, 10);
    let concurrent = 0;
    let maxConcurrent = 0;
    const task = () => new Promise<void>((resolve) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      setTimeout(() => { concurrent--; resolve(); }, 50);
    });
    await Promise.all([bh.execute(task), bh.execute(task), bh.execute(task)]);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('throws when queue is full', async () => {
    const bh = new Bulkhead(1, 1);
    const blocking = new Promise<void>(() => {}); // never resolves
    bh.execute(() => blocking).catch(() => {});
    bh.execute(() => blocking).catch(() => {});
    await expect(bh.execute(async () => {})).rejects.toThrow('queue full');
  });
});

describe('withTimeout', () => {
  it('resolves within timeout', async () => {
    const result = await withTimeout(async () => 'done', 1000);
    expect(result).toBe('done');
  });

  it('throws TimeoutError on expiry', async () => {
    await expect(
      withTimeout(async () => new Promise((r) => setTimeout(r, 500)), 50, 'Test')
    ).rejects.toThrow(TimeoutError);
  });
});

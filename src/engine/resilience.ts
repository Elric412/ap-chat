/**
 * Resilience Primitives
 * 
 * Circuit breaker, retry with exponential backoff, timeout guard,
 * and bulkhead isolation for all external calls.
 * 
 * Designed for browser-based chaos resistance:
 * - Network partitions & flaky connections
 * - Provider outages & rate limits
 * - IndexedDB corruption & quota exhaustion
 * - State corruption & race conditions
 */

// ─── Circuit Breaker ───────────────────────────────────────────

export type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreakerOptions {
  /** Max failures before opening circuit (default: 5) */
  failureThreshold: number;
  /** Time in ms before moving from open → half-open (default: 30_000) */
  recoveryTimeout: number;
  /** Number of successes in half-open to close circuit (default: 2) */
  halfOpenSuccessThreshold: number;
  /** Optional name for logging */
  name?: string;
}

const DEFAULT_CB_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  recoveryTimeout: 30_000,
  halfOpenSuccessThreshold: 2,
};

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private readonly options: CircuitBreakerOptions;
  private readonly listeners: Set<(state: CircuitState) => void> = new Set();

  constructor(options?: Partial<CircuitBreakerOptions>) {
    this.options = { ...DEFAULT_CB_OPTIONS, ...options };
  }

  get currentState(): CircuitState {
    if (this.state === 'open') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.options.recoveryTimeout) {
        this.transition('half-open');
      }
    }
    return this.state;
  }

  get stats() {
    return {
      state: this.currentState,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  onStateChange(fn: (state: CircuitState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.currentState;

    if (state === 'open') {
      throw new CircuitOpenError(
        `Circuit breaker "${this.options.name ?? 'unnamed'}" is OPEN — ${this.failureCount} failures`,
        this.options.recoveryTimeout - (Date.now() - this.lastFailureTime)
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  /** Force-reset to closed (manual recovery) */
  reset(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.transition('closed');
  }

  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.successCount += 1;
      if (this.successCount >= this.options.halfOpenSuccessThreshold) {
        this.failureCount = 0;
        this.successCount = 0;
        this.transition('closed');
      }
    } else {
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount += 1;
    this.lastFailureTime = Date.now();
    this.successCount = 0;

    if (this.failureCount >= this.options.failureThreshold) {
      this.transition('open');
    }
  }

  private transition(newState: CircuitState): void {
    if (this.state === newState) return;
    this.state = newState;
    for (const fn of this.listeners) {
      try { fn(newState); } catch { /* swallow listener errors */ }
    }
  }
}

export class CircuitOpenError extends Error {
  public readonly retryAfterMs: number;
  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = 'CircuitOpenError';
    this.retryAfterMs = retryAfterMs;
  }
}

// ─── Retry with Exponential Backoff ────────────────────────────

interface RetryOptions {
  /** Max retries (default: 3) */
  maxRetries: number;
  /** Base delay in ms (default: 1000) */
  baseDelay: number;
  /** Max delay cap in ms (default: 30_000) */
  maxDelay: number;
  /** Jitter factor 0–1 (default: 0.3) */
  jitter: number;
  /** Optional predicate — retry only if this returns true */
  retryIf?: (error: unknown) => boolean;
  /** Abort signal to cancel retries */
  signal?: AbortSignal;
  /** Callback on each retry attempt */
  onRetry?: (attempt: number, delay: number, error: unknown) => void;
}

const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30_000,
  jitter: 0.3,
};

function calcBackoff(attempt: number, base: number, max: number, jitter: number): number {
  const exponential = Math.min(base * Math.pow(2, attempt), max);
  const jitterRange = exponential * jitter;
  return exponential + (Math.random() * jitterRange * 2 - jitterRange);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>
): Promise<T> {
  const opts = { ...DEFAULT_RETRY, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      return await fn();
    } catch (err) {
      lastError = err;

      // Don't retry abort errors
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      // Don't retry circuit open errors
      if (err instanceof CircuitOpenError) throw err;
      // Check retry predicate
      if (opts.retryIf && !opts.retryIf(err)) throw err;
      // Don't retry past max
      if (attempt >= opts.maxRetries) break;

      const delay = calcBackoff(attempt, opts.baseDelay, opts.maxDelay, opts.jitter);
      opts.onRetry?.(attempt + 1, delay, err);

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delay);
        opts.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      });
    }
  }

  throw lastError;
}

// ─── Timeout Guard ─────────────────────────────────────────────

export class TimeoutError extends Error {
  constructor(message: string, public readonly timeoutMs: number) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  label = 'Operation'
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await fn(controller.signal);
    clearTimeout(timer);
    return result;
  } catch (err) {
    clearTimeout(timer);
    if (controller.signal.aborted && err instanceof DOMException && err.name === 'AbortError') {
      throw new TimeoutError(`${label} timed out after ${timeoutMs}ms`, timeoutMs);
    }
    throw err;
  }
}

// ─── Bulkhead (Concurrency Limiter) ───────────────────────────

export class Bulkhead {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueue: number = 50
  ) {}

  get stats() {
    return { active: this.active, queued: this.queue.length };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrent) {
      if (this.queue.length >= this.maxQueue) {
        throw new Error('Bulkhead queue full — system under excessive load');
      }
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }

    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

// ─── Resilient fetch wrapper ──────────────────────────────────

export interface ResilientFetchOptions {
  circuit?: CircuitBreaker;
  retry?: Partial<RetryOptions>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function resilientFetch(
  url: string,
  init: RequestInit = {},
  options: ResilientFetchOptions = {}
): Promise<Response> {
  const { circuit, retry, timeoutMs = 30_000, signal } = options;

  const doFetch = async (): Promise<Response> => {
    const fetchFn = async (abortSignal: AbortSignal) => {
      const mergedSignal = signal
        ? anySignal([signal, abortSignal])
        : abortSignal;

      const response = await fetch(url, { ...init, signal: mergedSignal });

      // Treat 5xx as retriable errors
      if (response.status >= 500) {
        const text = await response.text();
        throw new ServerError(response.status, text);
      }

      // Treat 429 as retriable
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        throw new RateLimitError(retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000);
      }

      return response;
    };

    return withTimeout(fetchFn, timeoutMs, `Fetch ${url}`);
  };

  const retryableFetch = () => withRetry(doFetch, {
    ...retry,
    signal,
    retryIf: (err) => {
      if (err instanceof ServerError) return true;
      if (err instanceof RateLimitError) return true;
      if (err instanceof TimeoutError) return true;
      if (err instanceof TypeError && err.message.includes('fetch')) return true; // network error
      return false;
    },
  });

  if (circuit) {
    return circuit.execute(retryableFetch);
  }

  return retryableFetch();
}

export class ServerError extends Error {
  constructor(public readonly status: number, public readonly body: string) {
    super(`Server error ${status}: ${body.slice(0, 200)}`);
    this.name = 'ServerError';
  }
}

export class RateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super(`Rate limited — retry after ${retryAfterMs}ms`);
    this.name = 'RateLimitError';
  }
}

// ─── Helpers ──────────────────────────────────────────────────

/** Combine multiple AbortSignals into one (first abort wins) */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

// ─── Global Circuit Breakers (singleton per provider) ─────────

const providerCircuits = new Map<string, CircuitBreaker>();

export function getProviderCircuit(providerId: string): CircuitBreaker {
  let cb = providerCircuits.get(providerId);
  if (!cb) {
    cb = new CircuitBreaker({
      name: `provider:${providerId}`,
      failureThreshold: 3,
      recoveryTimeout: 60_000,
      halfOpenSuccessThreshold: 1,
    });
    providerCircuits.set(providerId, cb);
  }
  return cb;
}

/** Get snapshot of all provider circuit states */
export function getAllCircuitStats(): Record<string, { state: CircuitState; failureCount: number }> {
  const stats: Record<string, { state: CircuitState; failureCount: number }> = {};
  for (const [id, cb] of providerCircuits) {
    const s = cb.stats;
    stats[id] = { state: s.state, failureCount: s.failureCount };
  }
  return stats;
}

// ─── IndexedDB Resilience ─────────────────────────────────────

const IDB_CIRCUIT = new CircuitBreaker({
  name: 'indexeddb',
  failureThreshold: 3,
  recoveryTimeout: 10_000,
  halfOpenSuccessThreshold: 1,
});

/**
 * Wrap any IndexedDB operation with circuit breaker + retry.
 * Falls back gracefully when storage is unavailable.
 */
export async function resilientIDB<T>(
  operation: () => Promise<T>,
  fallback?: T
): Promise<T> {
  try {
    return await IDB_CIRCUIT.execute(() =>
      withRetry(operation, {
        maxRetries: 2,
        baseDelay: 500,
        retryIf: (err) => {
          // Retry on transient IDB errors
          if (err instanceof DOMException) {
            return ['QuotaExceededError', 'UnknownError', 'InvalidStateError', 'AbortError']
              .includes(err.name);
          }
          return false;
        },
      })
    );
  } catch (err) {
    console.error('[resilientIDB] Operation failed after retries:', err);
    if (fallback !== undefined) return fallback;
    throw err;
  }
}

/** Check if IndexedDB is currently healthy */
export function isIDBHealthy(): boolean {
  return IDB_CIRCUIT.currentState !== 'open';
}

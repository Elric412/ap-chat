/**
 * AgentPool — bounded async concurrency (bulkhead). Threads AbortSignal.
 * Each submission runs under the pool's AbortController so abortAll() cancels in-flight work.
 */
import type { IAgentPool } from '../types/swarm/run';

export class AgentPool implements IAgentPool {
  readonly size: number;
  private active = 0;
  private readonly queue: Array<() => void> = [];
  private controller = new AbortController();

  constructor(maxConcurrent: number) {
    this.size = Math.max(1, maxConcurrent);
  }

  get inFlight(): number { return this.active; }

  async submit<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.controller.signal.aborted) {
      throw new DOMException('Pool aborted', 'AbortError');
    }
    if (this.active >= this.size) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
      if (this.controller.signal.aborted) throw new DOMException('Pool aborted', 'AbortError');
    }
    this.active++;
    try {
      return await fn(this.controller.signal);
    } finally {
      this.active--;
      const next = this.queue.shift();
      if (next) next();
    }
  }

  async drain(): Promise<void> {
    // Wait until queue is empty AND no work in flight.
    // Polling is acceptable here (very short pool lifetimes in practice).
    while (this.active > 0 || this.queue.length > 0) {
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  abortAll(): void {
    this.controller.abort();
    // Wake up everyone in the queue so they can reject promptly.
    while (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    }
    // Reset for any future use (unusual, but safe).
    this.controller = new AbortController();
  }
}

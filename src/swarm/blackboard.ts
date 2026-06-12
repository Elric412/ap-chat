/**
 * Blackboard — optimistic compare-and-swap KV store for one SwarmRun.
 * Same _clock LWW philosophy used in MessageNode.
 */
import type { IBlackboard, BlackboardEntry } from '../types/swarm/blackboard';
import type { AgentId, RunId, Result } from '../types/swarm/ids';
import { Ok, Err } from '../types/swarm/ids';
import type { SwarmError } from '../types/swarm/errors';

type Listener = (entry: BlackboardEntry) => void;

export class Blackboard implements IBlackboard {
  readonly runId: RunId;
  private readonly entries = new Map<string, BlackboardEntry>();
  private readonly listeners = new Set<Listener>();

  constructor(runId: RunId, seed?: BlackboardEntry[]) {
    this.runId = runId;
    if (seed) for (const e of seed) this.entries.set(e.key, e);
  }

  read<V>(key: string): BlackboardEntry<V> | undefined {
    return this.entries.get(key) as BlackboardEntry<V> | undefined;
  }

  write<V>(
    key: string,
    value: V,
    expectedVersion: number,
    writer: AgentId | 'orchestrator',
  ): Result<BlackboardEntry<V>, SwarmError> {
    const current = this.entries.get(key);
    const actual = current?.version ?? 0;
    if (actual !== expectedVersion) {
      return Err({ kind: 'version_conflict', key, expected: expectedVersion, actual });
    }
    const entry: BlackboardEntry<V> = {
      key,
      runId: this.runId,
      value,
      version: actual + 1,
      writerAgentId: writer,
      updatedAt: Date.now(),
    };
    this.entries.set(key, entry as BlackboardEntry);
    this.emit(entry as BlackboardEntry);
    return Ok(entry);
  }

  update<V>(
    key: string,
    fn: (current: V | undefined) => V,
    writer: AgentId | 'orchestrator',
    maxRetries = 3,
  ): Result<BlackboardEntry<V>, SwarmError> {
    let attempts = 0;
    let lastErr: SwarmError | null = null;
    while (attempts <= maxRetries) {
      const current = this.entries.get(key) as BlackboardEntry<V> | undefined;
      const next = fn(current?.value);
      const result = this.write(key, next, current?.version ?? 0, writer);
      if (result.ok) return result;
      lastErr = result.error;
      attempts++;
    }
    return Err(lastErr ?? { kind: 'internal', message: 'update: max retries exhausted' });
  }

  keys(prefix?: string): string[] {
    const out = Array.from(this.entries.keys());
    return prefix ? out.filter((k) => k.startsWith(prefix)) : out;
  }

  snapshot(): BlackboardEntry[] {
    return Array.from(this.entries.values()).map((e) => ({ ...e }));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(entry: BlackboardEntry): void {
    for (const l of this.listeners) {
      try { l(entry); } catch (e) { console.error('[Blackboard] listener error', e); }
    }
  }
}

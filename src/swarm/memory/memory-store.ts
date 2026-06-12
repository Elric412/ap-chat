/**
 * S11 — Memory store facade. Working/Episodic/Semantic scopes persisted in IDB.
 * Recall returns ranked records via retriever.ts.
 */
import type { IMemoryStore, MemoryRecord, MemoryQuery } from '../../types/swarm/memory';
import { newMemoryId, type MemoryId, type RunId, Ok, Err, type Result } from '../../types/swarm/ids';
import type { SwarmError } from '../../types/swarm/errors';
import { rankRecords } from './retriever';
import { putMemory, listMemories, deleteMemory, updateMemory } from '../../db/memory-repo';

export class MemoryStore implements IMemoryStore {
  /** In-memory cache for fast recall; rehydrated lazily. */
  private cache = new Map<MemoryId, MemoryRecord>();
  private rehydrated = false;

  private async ensureRehydrated(): Promise<void> {
    if (this.rehydrated) return;
    try {
      const all = await listMemories();
      for (const m of all) this.cache.set(m.id, m);
      this.rehydrated = true;
    } catch (e) {
      console.error('[MemoryStore] rehydrate failed', e);
    }
  }

  async remember(
    input: Omit<MemoryRecord, 'id' | 'createdAt' | 'lastAccessedAt'>,
  ): Promise<Result<MemoryId, SwarmError>> {
    const now = Date.now();
    const id = newMemoryId();
    const rec: MemoryRecord = { ...input, id, createdAt: now, lastAccessedAt: now };
    try {
      await putMemory(rec);
      this.cache.set(id, rec);
      return Ok(id);
    } catch (e) {
      return Err({ kind: 'memory_error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  async recall(query: MemoryQuery): Promise<Result<MemoryRecord[], SwarmError>> {
    await this.ensureRehydrated();
    const all = Array.from(this.cache.values());
    const ranked = rankRecords(all, query);
    const now = Date.now();
    for (const r of ranked) {
      r.lastAccessedAt = now;
      // best-effort persist
      void updateMemory(r.id, { lastAccessedAt: now }).catch(() => undefined);
    }
    return Ok(ranked);
  }

  async promote(id: MemoryId, to: MemoryRecord['scope']): Promise<Result<void, SwarmError>> {
    const rec = this.cache.get(id);
    if (!rec) return Err({ kind: 'memory_error', message: `Unknown memory ${id}` });
    rec.scope = to;
    try {
      await updateMemory(id, { scope: to });
      return Ok(undefined);
    } catch (e) {
      return Err({ kind: 'memory_error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  async evictWorking(runId: RunId): Promise<void> {
    await this.ensureRehydrated();
    const toDelete: MemoryId[] = [];
    for (const r of this.cache.values()) {
      if (r.scope === 'working' && r.runId === runId) toDelete.push(r.id);
    }
    for (const id of toDelete) {
      this.cache.delete(id);
      try { await deleteMemory(id); } catch { /* best-effort */ }
    }
  }
}

/** Singleton — one per app. */
export const memoryStore = new MemoryStore();

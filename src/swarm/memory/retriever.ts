/**
 * S11 — In-memory record store with naïve keyword scoring (BM25-lite).
 * Persistence happens via memory-repo.ts; this is a per-process cache used by
 * the MemoryStore facade.
 */
import type { MemoryRecord, MemoryQuery } from '../../types/swarm/memory';

const STOP = new Set(['the','a','an','of','to','and','or','in','on','for','with','is','it','that','this']);

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[\s,.\-_/:;()[\]{}!?"'`]+/).filter((t) => t.length > 2 && !STOP.has(t));
}

function recencyDecay(createdAt: number): number {
  const ageDays = (Date.now() - createdAt) / (1000 * 60 * 60 * 24);
  return Math.exp(-ageDays / 30); // half-life ~21d
}

export function scoreRecord(rec: MemoryRecord, queryTokens: string[]): number {
  if (queryTokens.length === 0) return rec.salience * recencyDecay(rec.createdAt);
  const contentTokens = new Set(tokenize(rec.content));
  let hits = 0;
  for (const t of queryTokens) if (contentTokens.has(t)) hits++;
  const tf = hits / Math.max(1, queryTokens.length);
  return tf * rec.salience * recencyDecay(rec.createdAt);
}

export function rankRecords(records: MemoryRecord[], q: MemoryQuery): MemoryRecord[] {
  const queryTokens = q.text ? tokenize(q.text) : [];
  return records
    .filter((r) => !q.scope || r.scope === q.scope)
    .filter((r) => !q.runId || r.runId === q.runId)
    .filter((r) => {
      if (!q.tags || q.tags.length === 0) return true;
      return q.tags.some((t) => r.tags.includes(t));
    })
    .map((r) => ({ rec: r, score: scoreRecord(r, queryTokens) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, q.limit ?? 8)
    .map((x) => x.rec);
}

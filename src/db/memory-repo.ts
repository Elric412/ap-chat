/**
 * Memory repository — IndexedDB persistence for MemoryRecord.
 */
import { getDB } from './connection';
import { resilientIDB } from '../engine/resilience';
import type { MemoryRecord } from '../types/swarm/memory';
import type { MemoryId } from '../types/swarm/ids';

const STORE = 'memory_records' as const;

export async function putMemory(rec: MemoryRecord): Promise<void> {
  await resilientIDB(async () => {
    const db = await getDB();
    await db.put(STORE as never, rec as never);
  });
}

export async function listMemories(): Promise<MemoryRecord[]> {
  return resilientIDB(async () => {
    const db = await getDB();
    return (await db.getAll(STORE as never)) as MemoryRecord[];
  }, []);
}

export async function updateMemory(id: MemoryId, patch: Partial<MemoryRecord>): Promise<void> {
  await resilientIDB(async () => {
    const db = await getDB();
    const cur = (await db.get(STORE as never, id as never)) as MemoryRecord | undefined;
    if (!cur) return;
    await db.put(STORE as never, { ...cur, ...patch } as never);
  });
}

export async function deleteMemory(id: MemoryId): Promise<void> {
  await resilientIDB(async () => {
    const db = await getDB();
    await db.delete(STORE as never, id as never);
  });
}

import { getDB } from './connection';
import { resilientIDB } from '../engine/resilience';
import type { Conversation } from '../types/conversations';

export async function putConversation(conversation: Conversation): Promise<void> {
  await resilientIDB(async () => {
    const db = await getDB();
    await db.put('conversations', conversation);
  });
}

export async function getConversation(id: string): Promise<Conversation | undefined> {
  return resilientIDB(async () => {
    const db = await getDB();
    return db.get('conversations', id);
  }, undefined);
}

export async function getAllConversations(): Promise<Conversation[]> {
  return resilientIDB(async () => {
    const db = await getDB();
    const all = await db.getAllFromIndex('conversations', 'by-updatedAt');
    return all
      .filter((c) => !c._deleted)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, []);
}

export async function deleteConversation(id: string): Promise<void> {
  await resilientIDB(async () => {
    const db = await getDB();
    const conv = await db.get('conversations', id);
    if (!conv) return;
    conv._deleted = true;
    conv._clock += 1;
    await db.put('conversations', conv);
  });
}

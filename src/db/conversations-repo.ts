import { getDB } from './connection';
import type { Conversation } from '../types/conversations';

export async function putConversation(conversation: Conversation): Promise<void> {
  const db = await getDB();
  await db.put('conversations', conversation);
}

export async function getConversation(id: string): Promise<Conversation | undefined> {
  const db = await getDB();
  return db.get('conversations', id);
}

export async function getAllConversations(): Promise<Conversation[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('conversations', 'by-updatedAt');
  return all
    .filter((c) => !c._deleted)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await getDB();
  const conv = await db.get('conversations', id);
  if (!conv) return;
  conv._deleted = true;
  conv._clock += 1;
  await db.put('conversations', conv);
}

import { getDB } from './connection';
import { resilientIDB } from '../engine/resilience';
import type { MessageNode } from '../types/messages';

export async function putMessage(message: MessageNode): Promise<void> {
  await resilientIDB(async () => {
    const db = await getDB();
    await db.put('messages', message);
  });
}

export async function putMessages(messages: MessageNode[]): Promise<void> {
  await resilientIDB(async () => {
    const db = await getDB();
    const tx = db.transaction('messages', 'readwrite');
    for (const msg of messages) {
      await tx.store.put(msg);
    }
    await tx.done;
  });
}

export async function getMessage(id: string): Promise<MessageNode | undefined> {
  return resilientIDB(async () => {
    const db = await getDB();
    return db.get('messages', id);
  }, undefined);
}

export async function getMessagesByConversation(conversationId: string): Promise<MessageNode[]> {
  return resilientIDB(async () => {
    const db = await getDB();
    return db.getAllFromIndex('messages', 'by-conversationId', conversationId);
  }, []);
}

export async function deleteMessagesByConversation(conversationId: string): Promise<void> {
  await resilientIDB(async () => {
    const db = await getDB();
    const messages = await db.getAllFromIndex('messages', 'by-conversationId', conversationId);
    const tx = db.transaction('messages', 'readwrite');
    for (const msg of messages) {
      msg._deleted = true;
      msg._clock += 1;
      await tx.store.put(msg);
    }
    await tx.done;
  });
}

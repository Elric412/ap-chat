import { getDB } from './connection';
import type { Attachment } from '../types/attachments';

export async function putAttachment(attachment: Attachment): Promise<void> {
  const db = await getDB();
  await db.put('attachments', attachment);
}

export async function putAttachments(attachments: Attachment[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('attachments', 'readwrite');
  await Promise.all([...attachments.map((a) => tx.store.put(a)), tx.done]);
}

export async function getAttachment(id: string): Promise<Attachment | undefined> {
  const db = await getDB();
  return db.get('attachments', id);
}

export async function getAttachmentsByConversation(conversationId: string): Promise<Attachment[]> {
  const db = await getDB();
  return db.getAllFromIndex('attachments', 'by-conversationId', conversationId);
}

export async function deleteAttachment(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('attachments', id);
}

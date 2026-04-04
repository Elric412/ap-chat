import { getDB } from './connection';
import { resilientIDB } from '../engine/resilience';
import type { Attachment } from '../types/attachments';

const WRITE_BATCH_SIZE = 100;

export async function putAttachment(attachment: Attachment): Promise<void> {
  await resilientIDB(async () => {
    const db = await getDB();
    await db.put('attachments', attachment);
  });
}

/**
 * Bulk insert with deduplication + chunked transactions to reduce
 * long-running write locks and improve reliability on constrained devices.
 */
export async function putAttachments(attachments: Attachment[]): Promise<void> {
  if (attachments.length === 0) return;

  const deduped = new Map<string, Attachment>();
  for (const attachment of attachments) {
    deduped.set(attachment.id, attachment);
  }

  const values = Array.from(deduped.values());

  await resilientIDB(async () => {
    const db = await getDB();

    for (let i = 0; i < values.length; i += WRITE_BATCH_SIZE) {
      const batch = values.slice(i, i + WRITE_BATCH_SIZE);
      const tx = db.transaction('attachments', 'readwrite');
      for (const attachment of batch) {
        await tx.store.put(attachment);
      }
      await tx.done;
    }
  });
}

export async function getAttachment(id: string): Promise<Attachment | undefined> {
  return resilientIDB(async () => {
    const db = await getDB();
    return db.get('attachments', id);
  }, undefined);
}

export async function getAttachmentsByConversation(conversationId: string): Promise<Attachment[]> {
  return resilientIDB(async () => {
    const db = await getDB();
    return db.getAllFromIndex('attachments', 'by-conversationId', conversationId);
  }, []);
}

export async function deleteAttachment(id: string): Promise<void> {
  await resilientIDB(async () => {
    const db = await getDB();
    await db.delete('attachments', id);
  });
}

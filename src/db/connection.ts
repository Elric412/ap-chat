import { openDB, type IDBPDatabase } from 'idb';
import { DB_NAME, DB_VERSION, type ByokChatDB } from './schema';

let dbInstance: IDBPDatabase<ByokChatDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<ByokChatDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<ByokChatDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Conversations
      if (!db.objectStoreNames.contains('conversations')) {
        const convStore = db.createObjectStore('conversations', { keyPath: 'id' });
        convStore.createIndex('by-updatedAt', 'updatedAt');
        convStore.createIndex('by-isArchived', 'isArchived');
      }

      // Messages
      if (!db.objectStoreNames.contains('messages')) {
        const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
        msgStore.createIndex('by-conversationId', 'conversationId');
        msgStore.createIndex('by-parentId', 'parentId');
        msgStore.createIndex('by-timestamp', 'timestamp');
      }

      // Attachments
      if (!db.objectStoreNames.contains('attachments')) {
        const attStore = db.createObjectStore('attachments', { keyPath: 'id' });
        attStore.createIndex('by-conversationId', 'conversationId');
      }

      // Encrypted Keys
      if (!db.objectStoreNames.contains('encrypted_keys')) {
        db.createObjectStore('encrypted_keys', { keyPath: 'providerId' });
      }

      // Vault Envelope
      if (!db.objectStoreNames.contains('vault_envelope')) {
        db.createObjectStore('vault_envelope');
      }

      // Presets
      if (!db.objectStoreNames.contains('presets')) {
        db.createObjectStore('presets', { keyPath: 'id' });
      }

      // Prompt Templates
      if (!db.objectStoreNames.contains('prompt_templates')) {
        const promptStore = db.createObjectStore('prompt_templates', { keyPath: 'id' });
        promptStore.createIndex('by-lastUsedAt', 'lastUsedAt');
      }

      // Artifacts
      if (!db.objectStoreNames.contains('artifacts')) {
        const artStore = db.createObjectStore('artifacts', { keyPath: 'id' });
        artStore.createIndex('by-conversationId', 'conversationId');
        artStore.createIndex('by-messageNodeId', 'messageNodeId');
      }
    },
  });

  return dbInstance;
}

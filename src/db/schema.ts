import type { DBSchema } from 'idb';
import type { Conversation } from '../types/conversations';
import type { MessageNode } from '../types/messages';
import type { Attachment } from '../types/attachments';
import type { EncryptedKeyRecord, VaultEnvelope } from '../types/vault';
import type { Artifact } from '../types/artifacts';

export const DB_NAME = 'byok-chat';
export const DB_VERSION = 1;

export interface ByokChatDB extends DBSchema {
  conversations: {
    key: string;
    value: Conversation;
    indexes: {
      'by-updatedAt': number;
      'by-isArchived': number;
    };
  };
  messages: {
    key: string;
    value: MessageNode;
    indexes: {
      'by-conversationId': string;
      'by-parentId': string;
      'by-timestamp': number;
    };
  };
  attachments: {
    key: string;
    value: Attachment;
    indexes: {
      'by-conversationId': string;
    };
  };
  encrypted_keys: {
    key: string;
    value: EncryptedKeyRecord;
  };
  vault_envelope: {
    key: string;
    value: VaultEnvelope;
  };
  presets: {
    key: string;
    value: Record<string, unknown>;
  };
  prompt_templates: {
    key: string;
    value: Record<string, unknown>;
    indexes: {
      'by-lastUsedAt': number;
    };
  };
  artifacts: {
    key: string;
    value: Artifact;
    indexes: {
      'by-conversationId': string;
      'by-messageNodeId': string;
    };
  };
}

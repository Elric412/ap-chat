import type { DBSchema } from 'idb';
import type { Conversation } from '../types/conversations';
import type { MessageNode } from '../types/messages';
import type { Attachment } from '../types/attachments';
import type { EncryptedKeyRecord, VaultEnvelope } from '../types/vault';
import type { Artifact } from '../types/artifacts';
import type { SwarmRun } from '../types/swarm/run';
import type { SerializedGraph } from '../types/swarm/task-graph';
import type { BlackboardEntry } from '../types/swarm/blackboard';
import type { AgentMessage } from '../types/swarm/messages';
import type { MemoryRecord } from '../types/swarm/memory';

export const DB_NAME = 'byok-chat';
// v2: add swarm_runs, swarm_graphs, blackboard_entries, agent_messages, memory_records.
export const DB_VERSION = 2;

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
  // ─── Swarm (v2) ──────────────────────────────────────────
  swarm_runs: {
    key: string;
    value: SwarmRun;
    indexes: {
      'by-status': string;
      'by-createdAt': number;
    };
  };
  swarm_graphs: {
    key: string;
    value: SerializedGraph;
    indexes: {
      'by-runId': string;
    };
  };
  blackboard_entries: {
    key: [string, string]; // [runId, key]
    value: BlackboardEntry;
    indexes: {
      'by-runId': string;
    };
  };
  agent_messages: {
    key: string;
    value: AgentMessage;
    indexes: {
      'by-runId': string;
      'by-timestamp': number;
    };
  };
  memory_records: {
    key: string;
    value: MemoryRecord;
    indexes: {
      'by-scope': string;
      'by-runId': string;
      'by-tags': string;
    };
  };
}


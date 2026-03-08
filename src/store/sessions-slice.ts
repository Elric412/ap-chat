import type { StateCreator } from 'zustand';
import type { Conversation } from '../types/conversations';
import { uuidv7 } from '../lib/uuid';
import {
  putConversation,
  getAllConversations,
  deleteConversation as deleteConvRepo,
} from '../db/conversations-repo';
import { deleteMessagesByConversation } from '../db/messages-repo';

export interface SessionsSlice {
  conversations: Conversation[];
  activeConversationId: string | null;
  conversationsLoaded: boolean;

  loadConversations: () => Promise<void>;
  createConversation: () => Conversation;
  setActiveConversation: (id: string | null) => void;
  updateConversation: (id: string, patch: Partial<Conversation>) => void;
  deleteConversation: (id: string) => Promise<void>;
}

export const createSessionsSlice: StateCreator<
  SessionsSlice,
  [['zustand/immer', never]],
  [],
  SessionsSlice
> = (set, get) => ({
  conversations: [],
  activeConversationId: null,
  conversationsLoaded: false,

  loadConversations: async () => {
    const convs = await getAllConversations();
    set((state) => {
      state.conversations = convs;
      state.conversationsLoaded = true;
    });
  },

  createConversation: () => {
    const now = Date.now();
    const rootId = uuidv7();
    const convId = uuidv7();

    const conversation: Conversation = {
      id: convId,
      title: 'New Conversation',
      rootNodeId: rootId,
      activeLeafId: rootId,
      createdAt: now,
      updatedAt: now,
      tags: [],
      totalCost: 0,
      totalTokens: { input: 0, output: 0, thinking: 0 },
      isArchived: false,
      _clock: 0,
      _deleted: false,
    };

    set((state) => {
      state.conversations.unshift(conversation);
      state.activeConversationId = convId;
    });

    // Persist asynchronously
    void putConversation(conversation);

    return conversation;
  },

  setActiveConversation: (id) => {
    set((state) => {
      state.activeConversationId = id;
    });
  },

  updateConversation: (id, patch) => {
    set((state) => {
      const conv = state.conversations.find((c) => c.id === id);
      if (!conv) return;
      Object.assign(conv, patch, { updatedAt: Date.now(), _clock: conv._clock + 1 });
    });
    // Persist
    const updated = get().conversations.find((c) => c.id === id);
    if (updated) void putConversation(updated);
  },

  deleteConversation: async (id) => {
    await deleteConvRepo(id);
    await deleteMessagesByConversation(id);
    set((state) => {
      state.conversations = state.conversations.filter((c) => c.id !== id);
      if (state.activeConversationId === id) {
        state.activeConversationId = state.conversations[0]?.id ?? null;
      }
    });
  },
});

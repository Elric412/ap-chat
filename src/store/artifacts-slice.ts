/**
 * Artifacts Slice
 * 
 * Manages artifact state: detected artifacts from messages,
 * active artifact selection, and version tracking.
 */

import type { StateCreator } from 'zustand';
import type { Artifact, ArtifactVersion } from '../types/artifacts';
import { uuidv7 } from '../lib/uuid';

export interface ArtifactsSlice {
  artifacts: Map<string, Artifact>;
  activeArtifactId: string | null;

  addArtifact: (artifact: Omit<Artifact, 'id' | 'createdAt' | 'updatedAt' | 'versions' | 'activeVersionIndex'> & { content: string }) => string;
  /**
   * Create or version a sandbox-sourced artifact, deduped by VFS path within
   * a conversation. Re-writing the same file appends a new version instead of
   * spawning a duplicate. Returns the artifact id (or null if not promotable).
   */
  upsertSandboxArtifact: (params: {
    conversationId: string;
    messageNodeId: string;
    path: string;
    content: string;
    type: Artifact['type'];
    language?: string;
    activate?: boolean;
  }) => string | null;
  updateArtifactContent: (artifactId: string, content: string, messageNodeId: string) => void;
  setActiveArtifact: (id: string | null) => void;
  removeArtifact: (id: string) => void;
  getArtifactsByConversation: (conversationId: string) => Artifact[];
  getActiveArtifactContent: () => string | null;
}

export const createArtifactsSlice: StateCreator<
  ArtifactsSlice,
  [['zustand/immer', never]],
  [],
  ArtifactsSlice
> = (set, get) => ({
  artifacts: new Map(),
  activeArtifactId: null,

  addArtifact: (params) => {
    const id = uuidv7();
    const now = Date.now();
    const version: ArtifactVersion = {
      id: uuidv7(),
      content: params.content,
      createdAt: now,
      messageNodeId: params.messageNodeId,
    };
    const artifact: Artifact = {
      id,
      conversationId: params.conversationId,
      messageNodeId: params.messageNodeId,
      type: params.type,
      title: params.title,
      language: params.language,
      versions: [version],
      activeVersionIndex: 0,
      createdAt: now,
      updatedAt: now,
    };
    set((state) => {
      state.artifacts.set(id, artifact);
      state.activeArtifactId = id;
    });
    return id;
  },

  upsertSandboxArtifact: (params) => {
    const { conversationId, messageNodeId, path, content, type, language, activate = false } = params;
    // Find an existing sandbox artifact for this path in this conversation.
    let existingId: string | null = null;
    for (const a of get().artifacts.values()) {
      if (a.source === 'sandbox' && a.conversationId === conversationId && a.sandboxPath === path) {
        existingId = a.id;
        break;
      }
    }

    if (existingId) {
      const existing = get().artifacts.get(existingId)!;
      const current = existing.versions[existing.versions.length - 1]?.content;
      // Skip no-op writes so we don't pile up identical versions.
      if (current === content) {
        if (activate) set((state) => { state.activeArtifactId = existingId; });
        return existingId;
      }
      set((state) => {
        const artifact = state.artifacts.get(existingId!);
        if (!artifact) return;
        artifact.versions.push({ id: uuidv7(), content, createdAt: Date.now(), messageNodeId });
        artifact.activeVersionIndex = artifact.versions.length - 1;
        artifact.updatedAt = Date.now();
        if (activate) state.activeArtifactId = existingId;
      });
      return existingId;
    }

    const id = uuidv7();
    const now = Date.now();
    const artifact: Artifact = {
      id,
      conversationId,
      messageNodeId,
      type,
      title: path,
      language,
      versions: [{ id: uuidv7(), content, createdAt: now, messageNodeId }],
      activeVersionIndex: 0,
      createdAt: now,
      updatedAt: now,
      source: 'sandbox',
      sandboxPath: path,
    };
    set((state) => {
      state.artifacts.set(id, artifact);
      if (activate) state.activeArtifactId = id;
    });
    return id;
  },

  updateArtifactContent: (artifactId, content, messageNodeId) => {
    set((state) => {
      const artifact = state.artifacts.get(artifactId);
      if (!artifact) return;
      const newVersion: ArtifactVersion = {
        id: uuidv7(),
        content,
        createdAt: Date.now(),
        messageNodeId,
      };
      artifact.versions.push(newVersion);
      artifact.activeVersionIndex = artifact.versions.length - 1;
      artifact.updatedAt = Date.now();
    });
  },

  setActiveArtifact: (id) => set((state) => { state.activeArtifactId = id; }),

  removeArtifact: (id) => set((state) => {
    state.artifacts.delete(id);
    if (state.activeArtifactId === id) state.activeArtifactId = null;
  }),

  getArtifactsByConversation: (conversationId) => {
    const arts: Artifact[] = [];
    for (const a of get().artifacts.values()) {
      if (a.conversationId === conversationId) arts.push(a);
    }
    return arts.sort((a, b) => a.createdAt - b.createdAt);
  },

  getActiveArtifactContent: () => {
    const id = get().activeArtifactId;
    if (!id) return null;
    const artifact = get().artifacts.get(id);
    if (!artifact) return null;
    return artifact.versions[artifact.activeVersionIndex]?.content ?? null;
  },
});

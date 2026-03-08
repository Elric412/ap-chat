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

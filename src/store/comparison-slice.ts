/**
 * Comparison Slice — Manages parallel inference sessions
 *
 * Tracks 2–4 concurrent panes, each streaming independently.
 * Supports diff view and consensus mode.
 */

import type { StateCreator } from 'zustand';
import { uuidv7 } from '../lib/uuid';

export type ComparisonViewMode = 'side_by_side' | 'diff' | 'consensus';

export interface ComparisonPane {
  id: string;
  modelId: string;
  /** Accumulated streamed text */
  text: string;
  /** Thinking content */
  thinkingContent: string | null;
  status: 'idle' | 'streaming' | 'complete' | 'error' | 'aborted';
  error: string | null;
  /** Token metrics */
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  latencyMs: number | null;
  costTotal: number;
  startedAt: number | null;
}

export interface ComparisonSession {
  id: string;
  conversationId: string;
  prompt: string;
  panes: ComparisonPane[];
  viewMode: ComparisonViewMode;
  consensusText: string | null;
  createdAt: number;
}

export interface ComparisonSlice {
  comparisonMode: boolean;
  comparisonModelIds: string[];
  activeComparison: ComparisonSession | null;

  setComparisonMode: (active: boolean) => void;
  setComparisonModelIds: (ids: string[]) => void;
  addComparisonModelId: (id: string) => void;
  removeComparisonModelId: (id: string) => void;
  startComparison: (conversationId: string, prompt: string) => ComparisonSession;
  updatePane: (sessionId: string, paneId: string, update: Partial<ComparisonPane>) => void;
  setPaneText: (sessionId: string, paneId: string, text: string) => void;
  setPaneStatus: (sessionId: string, paneId: string, status: ComparisonPane['status']) => void;
  setComparisonViewMode: (mode: ComparisonViewMode) => void;
  setConsensusText: (text: string) => void;
  clearComparison: () => void;
}

function createPane(modelId: string): ComparisonPane {
  return {
    id: uuidv7(),
    modelId,
    text: '',
    thinkingContent: null,
    status: 'idle',
    error: null,
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    latencyMs: null,
    costTotal: 0,
    startedAt: null,
  };
}

export const createComparisonSlice: StateCreator<
  ComparisonSlice,
  [['zustand/immer', never]],
  [],
  ComparisonSlice
> = (set, get) => ({
  comparisonMode: false,
  comparisonModelIds: [],
  activeComparison: null,

  setComparisonMode: (active) => set((s) => { s.comparisonMode = active; }),

  setComparisonModelIds: (ids) => set((s) => {
    s.comparisonModelIds = ids.slice(0, 4);
  }),

  addComparisonModelId: (id) => set((s) => {
    if (s.comparisonModelIds.length < 4 && !s.comparisonModelIds.includes(id)) {
      s.comparisonModelIds.push(id);
    }
  }),

  removeComparisonModelId: (id) => set((s) => {
    s.comparisonModelIds = s.comparisonModelIds.filter((m) => m !== id);
  }),

  startComparison: (conversationId, prompt) => {
    const modelIds = get().comparisonModelIds;
    const session: ComparisonSession = {
      id: uuidv7(),
      conversationId,
      prompt,
      panes: modelIds.map((mid) => createPane(mid)),
      viewMode: 'side_by_side',
      consensusText: null,
      createdAt: Date.now(),
    };
    set((s) => { s.activeComparison = session; });
    return session;
  },

  updatePane: (sessionId, paneId, update) => set((s) => {
    if (s.activeComparison?.id !== sessionId) return;
    const pane = s.activeComparison.panes.find((p) => p.id === paneId);
    if (pane) Object.assign(pane, update);
  }),

  setPaneText: (sessionId, paneId, text) => set((s) => {
    if (s.activeComparison?.id !== sessionId) return;
    const pane = s.activeComparison.panes.find((p) => p.id === paneId);
    if (pane) pane.text = text;
  }),

  setPaneStatus: (sessionId, paneId, status) => set((s) => {
    if (s.activeComparison?.id !== sessionId) return;
    const pane = s.activeComparison.panes.find((p) => p.id === paneId);
    if (pane) pane.status = status;
  }),

  setComparisonViewMode: (mode) => set((s) => {
    if (s.activeComparison) s.activeComparison.viewMode = mode;
  }),

  setConsensusText: (text) => set((s) => {
    if (s.activeComparison) s.activeComparison.consensusText = text;
  }),

  clearComparison: () => set((s) => {
    s.activeComparison = null;
  }),
});

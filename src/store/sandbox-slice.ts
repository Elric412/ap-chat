/**
 * Sandbox UI Slice
 *
 * Surfaces sandbox executions in the UI. Execution records are kept
 * lightweight here; heavy state (workers, VFS) lives in the manager.
 */

import type { StateCreator } from 'zustand';
import type { SandboxExecutionResult } from '../sandbox/types';

const SANDBOX_ENABLED_KEY = 'byok-sandbox-enabled';

function readEnabled(): boolean {
  try {
    const v = localStorage.getItem(SANDBOX_ENABLED_KEY);
    return v === null ? true : v === 'true';
  } catch { return true; }
}

export interface SandboxSlice {
  sandboxEnabled: boolean;
  /** Executions grouped by conversationId, newest last. */
  executions: Map<string, SandboxExecutionResult[]>;

  setSandboxEnabled: (enabled: boolean) => void;
  recordExecution: (result: SandboxExecutionResult) => void;
  clearExecutions: (conversationId: string) => void;
  getExecutions: (conversationId: string) => SandboxExecutionResult[];
}

export const createSandboxSlice: StateCreator<
  SandboxSlice,
  [['zustand/immer', never]],
  [],
  SandboxSlice
> = (set, get) => ({
  sandboxEnabled: readEnabled(),
  executions: new Map(),

  setSandboxEnabled: (enabled) => {
    try { localStorage.setItem(SANDBOX_ENABLED_KEY, String(enabled)); } catch { /* noop */ }
    set((s) => { s.sandboxEnabled = enabled; });
  },

  recordExecution: (result) => set((s) => {
    const arr = s.executions.get(result.sessionId) ?? [];
    arr.push(result);
    // Keep a rolling window of 50 executions per session to bound memory.
    if (arr.length > 50) arr.splice(0, arr.length - 50);
    s.executions.set(result.sessionId, arr);
  }),

  clearExecutions: (conversationId) => set((s) => { s.executions.delete(conversationId); }),

  getExecutions: (conversationId) => get().executions.get(conversationId) ?? [],
});

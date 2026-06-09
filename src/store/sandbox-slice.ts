/**
 * Sandbox UI Slice
 *
 * Surfaces sandbox executions in the UI. Execution records are kept
 * lightweight here; heavy state (workers, VFS) lives in the manager.
 */

import type { StateCreator } from 'zustand';
import type { SandboxExecutionResult } from '../sandbox/types';

const SANDBOX_ENABLED_KEY = 'byok-sandbox-enabled';
const AGENT_MODE_KEY = 'byok-agent-mode';
const SMART_SKILL_KEY = 'byok-smart-skill-routing';

function readBool(key: string, def: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? def : v === 'true';
  } catch { return def; }
}

export interface SandboxSlice {
  sandboxEnabled: boolean;
  agentModeEnabled: boolean;
  smartSkillRouting: boolean;
  /** Executions grouped by conversationId, newest last. */
  executions: Map<string, SandboxExecutionResult[]>;

  setSandboxEnabled: (enabled: boolean) => void;
  setAgentModeEnabled: (enabled: boolean) => void;
  setSmartSkillRouting: (enabled: boolean) => void;
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
  sandboxEnabled: readBool(SANDBOX_ENABLED_KEY, true),
  agentModeEnabled: readBool(AGENT_MODE_KEY, true),
  smartSkillRouting: readBool(SMART_SKILL_KEY, true),
  executions: new Map(),

  setSandboxEnabled: (enabled) => {
    try { localStorage.setItem(SANDBOX_ENABLED_KEY, String(enabled)); } catch { /* noop */ }
    set((s) => { s.sandboxEnabled = enabled; });
  },
  setAgentModeEnabled: (enabled) => {
    try { localStorage.setItem(AGENT_MODE_KEY, String(enabled)); } catch { /* noop */ }
    set((s) => { s.agentModeEnabled = enabled; });
  },
  setSmartSkillRouting: (enabled) => {
    try { localStorage.setItem(SMART_SKILL_KEY, String(enabled)); } catch { /* noop */ }
    set((s) => { s.smartSkillRouting = enabled; });
  },

  recordExecution: (result) => set((s) => {
    const arr = s.executions.get(result.sessionId) ?? [];
    arr.push(result);
    if (arr.length > 50) arr.splice(0, arr.length - 50);
    s.executions.set(result.sessionId, arr);
  }),

  clearExecutions: (conversationId) => set((s) => { s.executions.delete(conversationId); }),

  getExecutions: (conversationId) => get().executions.get(conversationId) ?? [],
});

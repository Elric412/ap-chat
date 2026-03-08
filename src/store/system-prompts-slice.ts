/**
 * System Prompts Slice
 * 
 * Manages global and per-conversation system prompts,
 * plus a template library with CRUD operations.
 */

import type { StateCreator } from 'zustand';
import type { SystemPromptTemplate, SystemPromptConfig } from '../types/system-prompts';
import { BUILTIN_TEMPLATES } from '../constants/system-prompt-templates';
import { uuidv7 } from '../lib/uuid';

const STORAGE_KEY = 'byok-system-prompts';
const TEMPLATES_KEY = 'byok-custom-templates';

function loadConfig(): SystemPromptConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* noop */ }
  return { globalPrompt: '', conversationPrompts: {} };
}

function saveConfig(config: SystemPromptConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch { /* noop */ }
}

function loadCustomTemplates(): SystemPromptTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* noop */ }
  return [];
}

function saveCustomTemplates(templates: SystemPromptTemplate[]): void {
  try {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
  } catch { /* noop */ }
}

export interface SystemPromptsSlice {
  systemPromptConfig: SystemPromptConfig;
  customTemplates: SystemPromptTemplate[];

  /** Get the effective system prompt for a conversation */
  getEffectiveSystemPrompt: (conversationId?: string | null) => string;
  /** Set the global default system prompt */
  setGlobalSystemPrompt: (prompt: string) => void;
  /** Set a per-conversation system prompt */
  setConversationSystemPrompt: (conversationId: string, prompt: string) => void;
  /** Clear a per-conversation override (falls back to global) */
  clearConversationSystemPrompt: (conversationId: string) => void;
  /** Get all templates (builtin + custom) */
  getAllTemplates: () => SystemPromptTemplate[];
  /** Add a custom template */
  addTemplate: (name: string, content: string, description: string, category: SystemPromptTemplate['category']) => SystemPromptTemplate;
  /** Delete a custom template */
  deleteTemplate: (id: string) => void;
  /** Update a custom template */
  updateTemplate: (id: string, patch: Partial<Pick<SystemPromptTemplate, 'name' | 'content' | 'description' | 'category'>>) => void;
}

export const createSystemPromptsSlice: StateCreator<
  SystemPromptsSlice,
  [['zustand/immer', never]],
  [],
  SystemPromptsSlice
> = (set, get) => ({
  systemPromptConfig: loadConfig(),
  customTemplates: loadCustomTemplates(),

  getEffectiveSystemPrompt: (conversationId) => {
    const config = get().systemPromptConfig;
    if (conversationId && config.conversationPrompts[conversationId]) {
      return config.conversationPrompts[conversationId];
    }
    return config.globalPrompt;
  },

  setGlobalSystemPrompt: (prompt) => {
    set((state) => {
      state.systemPromptConfig.globalPrompt = prompt;
    });
    saveConfig(get().systemPromptConfig);
  },

  setConversationSystemPrompt: (conversationId, prompt) => {
    set((state) => {
      state.systemPromptConfig.conversationPrompts[conversationId] = prompt;
    });
    saveConfig(get().systemPromptConfig);
  },

  clearConversationSystemPrompt: (conversationId) => {
    set((state) => {
      delete state.systemPromptConfig.conversationPrompts[conversationId];
    });
    saveConfig(get().systemPromptConfig);
  },

  getAllTemplates: () => {
    return [...BUILTIN_TEMPLATES, ...get().customTemplates];
  },

  addTemplate: (name, content, description, category) => {
    const template: SystemPromptTemplate = {
      id: uuidv7(),
      name,
      content,
      description,
      category,
      isBuiltin: false,
      createdAt: Date.now(),
      lastUsedAt: 0,
    };
    set((state) => {
      state.customTemplates.push(template);
    });
    saveCustomTemplates(get().customTemplates);
    return template;
  },

  deleteTemplate: (id) => {
    set((state) => {
      state.customTemplates = state.customTemplates.filter((t) => t.id !== id);
    });
    saveCustomTemplates(get().customTemplates);
  },

  updateTemplate: (id, patch) => {
    set((state) => {
      const tmpl = state.customTemplates.find((t) => t.id === id);
      if (tmpl) Object.assign(tmpl, patch);
    });
    saveCustomTemplates(get().customTemplates);
  },
});

/**
 * System Prompt Types
 * 
 * Defines the shape for system prompt templates and
 * per-conversation system prompt configuration.
 */

export interface SystemPromptTemplate {
  id: string;
  name: string;
  content: string;
  description: string;
  category: 'general' | 'coding' | 'writing' | 'analysis' | 'roleplay' | 'custom';
  isBuiltin: boolean;
  createdAt: number;
  lastUsedAt: number;
}

export interface SystemPromptConfig {
  /** Global default system prompt (used when conversation has none) */
  globalPrompt: string;
  /** Per-conversation overrides keyed by conversation ID */
  conversationPrompts: Record<string, string>;
}

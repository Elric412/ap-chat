/**
 * Skill Library Types
 *
 * Defines skill entities, library configuration, and resolution results.
 */

export type SkillCategory =
  | 'frontend'
  | 'backend'
  | 'data'
  | 'devops'
  | 'design'
  | 'writing'
  | 'analysis'
  | 'security'
  | 'mobile'
  | 'general';

export interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  category: SkillCategory;
  tags: string[];
  icon: string;
  isBuiltin: boolean;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export type SkillLibraryMode = 'disabled' | 'all' | 'custom';
export type SkillSelectionStrategy = 'single_pass' | 'two_pass';

export interface SkillLibraryConfig {
  mode: SkillLibraryMode;
  customSelection: string[];
  strategy: SkillSelectionStrategy;
}

export interface SkillResolutionResult {
  selectedIds: string[];
  reasoning: string;
  noSkillsNeeded: boolean;
}

export const DEFAULT_SKILL_CONFIG: SkillLibraryConfig = {
  mode: 'all',
  customSelection: [],
  strategy: 'single_pass',
};

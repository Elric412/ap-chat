/**
 * Skills Repository — IndexedDB persistence for skills
 */

import type { Skill } from '../types/skills';
import type { SkillLibraryConfig } from '../types/skills';

const SKILLS_STORAGE_KEY = 'byok-skills';
const SKILLS_CONFIG_KEY = 'byok-skills-config';

/** Load all skills from localStorage */
export function loadSkills(): Skill[] {
  try {
    const raw = localStorage.getItem(SKILLS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Skill[];
  } catch {
    return [];
  }
}

/** Save all skills to localStorage */
export function saveSkills(skills: Skill[]): void {
  try {
    localStorage.setItem(SKILLS_STORAGE_KEY, JSON.stringify(skills));
  } catch { /* noop */ }
}

/** Load skill library configuration */
export function loadSkillConfig(): SkillLibraryConfig | null {
  try {
    const raw = localStorage.getItem(SKILLS_CONFIG_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SkillLibraryConfig;
  } catch {
    return null;
  }
}

/** Save skill library configuration */
export function saveSkillConfig(config: SkillLibraryConfig): void {
  try {
    localStorage.setItem(SKILLS_CONFIG_KEY, JSON.stringify(config));
  } catch { /* noop */ }
}

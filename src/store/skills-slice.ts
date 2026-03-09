/**
 * Skills Slice — Zustand state for the Skill Library system
 */

import type { StateCreator } from 'zustand';
import type { Skill, SkillCategory, SkillLibraryConfig, SkillLibraryMode, SkillSelectionStrategy } from '../types/skills';
import { DEFAULT_SKILL_CONFIG } from '../types/skills';
import { BUILTIN_SKILLS } from '../constants/built-in-skills';
import { loadSkills, saveSkills, loadSkillConfig, saveSkillConfig } from '../db/skills-repo';
import { uuidv7 } from '../lib/uuid';

export interface SkillsSlice {
  skills: Skill[];
  skillConfig: SkillLibraryConfig;
  skillPanelOpen: boolean;
  skillEditorOpen: boolean;
  editingSkillId: string | null;

  // Init
  initSkills: () => void;

  // Config
  setSkillMode: (mode: SkillLibraryMode) => void;
  setSkillStrategy: (strategy: SkillSelectionStrategy) => void;
  toggleSkillCustomSelection: (skillId: string) => void;
  setSkillPanelOpen: (open: boolean) => void;
  setSkillEditorOpen: (open: boolean, skillId?: string | null) => void;

  // CRUD
  toggleSkillEnabled: (skillId: string) => void;
  createSkill: (data: Omit<Skill, 'id' | 'isBuiltin' | 'createdAt' | 'updatedAt'>) => string;
  updateSkill: (skillId: string, patch: Partial<Skill>) => void;
  deleteSkill: (skillId: string) => void;
  duplicateSkill: (skillId: string) => string | null;
  resetBuiltinSkill: (skillId: string) => void;

  // Derived
  getAvailableSkills: () => Skill[];
  getSkillsByCategory: () => Map<SkillCategory, Skill[]>;
  getSkillTokenEstimate: () => number;
}

export const createSkillsSlice: StateCreator<
  SkillsSlice,
  [['zustand/immer', never]],
  [],
  SkillsSlice
> = (set, get) => ({
  skills: [],
  skillConfig: { ...DEFAULT_SKILL_CONFIG },
  skillPanelOpen: false,
  skillEditorOpen: false,
  editingSkillId: null,

  initSkills: () => {
    const stored = loadSkills();
    const config = loadSkillConfig();

    // Merge builtin skills with stored overrides
    const builtinIds = new Set(BUILTIN_SKILLS.map((s) => s.id));
    const storedMap = new Map(stored.map((s) => [s.id, s]));

    const merged: Skill[] = [];

    // Add builtins, applying stored overrides for enabled state
    for (const builtin of BUILTIN_SKILLS) {
      const override = storedMap.get(builtin.id);
      if (override) {
        // Preserve user's enabled state and any edits to instructions
        merged.push({ ...builtin, enabled: override.enabled, instructions: override.instructions, updatedAt: override.updatedAt });
      } else {
        merged.push({ ...builtin });
      }
    }

    // Add user-created skills
    for (const s of stored) {
      if (!builtinIds.has(s.id)) {
        merged.push(s);
      }
    }

    set((state) => {
      state.skills = merged;
      if (config) state.skillConfig = config;
    });
  },

  setSkillMode: (mode) => {
    set((state) => { state.skillConfig.mode = mode; });
    saveSkillConfig(get().skillConfig);
  },

  setSkillStrategy: (strategy) => {
    set((state) => { state.skillConfig.strategy = strategy; });
    saveSkillConfig(get().skillConfig);
  },

  toggleSkillCustomSelection: (skillId) => {
    set((state) => {
      const idx = state.skillConfig.customSelection.indexOf(skillId);
      if (idx >= 0) {
        state.skillConfig.customSelection.splice(idx, 1);
      } else {
        state.skillConfig.customSelection.push(skillId);
      }
    });
    saveSkillConfig(get().skillConfig);
  },

  setSkillPanelOpen: (open) => set((state) => { state.skillPanelOpen = open; }),

  setSkillEditorOpen: (open, skillId) => set((state) => {
    state.skillEditorOpen = open;
    state.editingSkillId = skillId ?? null;
  }),

  toggleSkillEnabled: (skillId) => {
    set((state) => {
      const skill = state.skills.find((s) => s.id === skillId);
      if (skill) {
        skill.enabled = !skill.enabled;
        skill.updatedAt = Date.now();
      }
    });
    saveSkills(get().skills);
  },

  createSkill: (data) => {
    const id = `skill-custom-${uuidv7()}`;
    const now = Date.now();
    const skill: Skill = { ...data, id, isBuiltin: false, createdAt: now, updatedAt: now };
    set((state) => { state.skills.push(skill); });
    saveSkills(get().skills);
    return id;
  },

  updateSkill: (skillId, patch) => {
    set((state) => {
      const skill = state.skills.find((s) => s.id === skillId);
      if (skill) {
        Object.assign(skill, patch, { updatedAt: Date.now() });
      }
    });
    saveSkills(get().skills);
  },

  deleteSkill: (skillId) => {
    set((state) => {
      const idx = state.skills.findIndex((s) => s.id === skillId);
      if (idx >= 0 && !state.skills[idx].isBuiltin) {
        state.skills.splice(idx, 1);
        // Remove from custom selection
        const selIdx = state.skillConfig.customSelection.indexOf(skillId);
        if (selIdx >= 0) state.skillConfig.customSelection.splice(selIdx, 1);
      }
    });
    saveSkills(get().skills);
    saveSkillConfig(get().skillConfig);
  },

  duplicateSkill: (skillId) => {
    const original = get().skills.find((s) => s.id === skillId);
    if (!original) return null;
    return get().createSkill({
      name: `${original.name} (Copy)`,
      description: original.description,
      instructions: original.instructions,
      category: original.category,
      tags: [...original.tags],
      icon: original.icon,
      enabled: false,
    });
  },

  resetBuiltinSkill: (skillId) => {
    const builtin = BUILTIN_SKILLS.find((s) => s.id === skillId);
    if (!builtin) return;
    set((state) => {
      const skill = state.skills.find((s) => s.id === skillId);
      if (skill) {
        skill.instructions = builtin.instructions;
        skill.updatedAt = Date.now();
      }
    });
    saveSkills(get().skills);
  },

  getAvailableSkills: () => {
    const { skills, skillConfig } = get();
    if (skillConfig.mode === 'disabled') return [];
    if (skillConfig.mode === 'all') return skills.filter((s) => s.enabled);
    // custom mode
    return skills.filter((s) => s.enabled && skillConfig.customSelection.includes(s.id));
  },

  getSkillsByCategory: () => {
    const map = new Map<SkillCategory, Skill[]>();
    for (const skill of get().skills) {
      const list = map.get(skill.category) ?? [];
      list.push(skill);
      map.set(skill.category, list);
    }
    return map;
  },

  getSkillTokenEstimate: () => {
    const available = get().getAvailableSkills();
    if (available.length === 0) return 0;
    // Estimate: catalog section + instructions
    let total = 100; // overhead for the awareness block
    for (const skill of available) {
      total += Math.ceil(skill.description.length / 4);
      total += Math.ceil(skill.instructions.length / 4);
    }
    return total;
  },
});

/**
 * Presets — Model parameter preset system
 *
 * Stores named configurations of model + inference parameters
 * that can be quickly applied.
 */

import type { InferenceParameters } from '../types/parameters';

export interface Preset {
  id: string;
  name: string;
  description: string;
  modelId: string | null;
  parameters: Partial<InferenceParameters>;
  isBuiltin: boolean;
  createdAt: number;
}

export const BUILTIN_PRESETS: Preset[] = [
  {
    id: 'precise',
    name: 'Precise',
    description: 'Low temperature for factual, deterministic responses',
    modelId: null,
    parameters: { temperature: 0.2, topP: 0.9 },
    isBuiltin: true,
    createdAt: 0,
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Default balanced settings for general use',
    modelId: null,
    parameters: { temperature: 0.7, topP: 1 },
    isBuiltin: true,
    createdAt: 0,
  },
  {
    id: 'creative',
    name: 'Creative',
    description: 'Higher temperature for creative writing and brainstorming',
    modelId: null,
    parameters: { temperature: 1.2, topP: 0.95 },
    isBuiltin: true,
    createdAt: 0,
  },
  {
    id: 'max-output',
    name: 'Long Form',
    description: 'Maximize output length for detailed responses',
    modelId: null,
    parameters: { temperature: 0.7, topP: 1, maxOutputTokens: 32768 },
    isBuiltin: true,
    createdAt: 0,
  },
  {
    id: 'code-gen',
    name: 'Code Generation',
    description: 'Optimized for generating clean code',
    modelId: null,
    parameters: { temperature: 0.3, topP: 0.95 },
    isBuiltin: true,
    createdAt: 0,
  },
];

const STORAGE_KEY = 'byok-custom-presets';

/** Load custom presets from localStorage */
export function loadCustomPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Preset[];
  } catch {
    return [];
  }
}

/** Save custom presets to localStorage */
export function saveCustomPresets(presets: Preset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch { /* noop */ }
}

/** Get all presets (builtin + custom) */
export function getAllPresets(): Preset[] {
  return [...BUILTIN_PRESETS, ...loadCustomPresets()];
}

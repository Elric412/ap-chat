import type { StateCreator } from 'zustand';
import type { ThemeMode, ResolvedTheme, DensityMode } from '../types/ui';
import type { InferenceParameters } from '../types/parameters';
import type { ContextConfig, ContextStrategy } from '../engine/context-engine';
import { DEFAULT_PARAMETERS } from '../constants/default-parameters';
import { DEFAULT_CONTEXT_CONFIG } from '../engine/context-engine';

export interface UISlice {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  density: DensityMode;
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  canvasOpen: boolean;
  focusMode: boolean;
  paramDrawerOpen: boolean;
  selectedModelId: string;
  inferenceParams: InferenceParameters;
  contextConfig: ContextConfig;
  webSearchEnabled: boolean;

  setTheme: (theme: ThemeMode) => void;
  setResolvedTheme: (resolved: ResolvedTheme) => void;
  setDensity: (density: DensityMode) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleCanvas: () => void;
  setCanvasOpen: (open: boolean) => void;
  toggleFocusMode: () => void;
  setParamDrawerOpen: (open: boolean) => void;
  setSelectedModelId: (id: string) => void;
  setInferenceParams: (params: InferenceParameters) => void;
  setContextConfig: (config: Partial<ContextConfig>) => void;
  setContextStrategy: (strategy: ContextStrategy) => void;
  setWebSearchEnabled: (enabled: boolean) => void;
  toggleWebSearch: () => void;
}

const STORAGE_KEYS = {
  theme: 'byok-theme',
  density: 'byok-density',
} as const;

function getStoredTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.theme);
    if (stored === 'dark' || stored === 'light' || stored === 'system') return stored;
  } catch { /* noop */ }
  return 'dark';
}

function getStoredDensity(): DensityMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.density);
    if (stored === 'compact' || stored === 'comfortable' || stored === 'spacious') return stored;
  } catch { /* noop */ }
  return 'comfortable';
}

export const createUISlice: StateCreator<UISlice, [['zustand/immer', never]], [], UISlice> = (set) => ({
  theme: getStoredTheme(),
  resolvedTheme: getStoredTheme() === 'system' ? 'dark' : (getStoredTheme() as ResolvedTheme),
  density: getStoredDensity(),
  sidebarOpen: true,
  sidebarCollapsed: false,
  canvasOpen: false,
  focusMode: false,
  paramDrawerOpen: false,
  selectedModelId: 'claude-sonnet-4-6-20260301',
  inferenceParams: { ...DEFAULT_PARAMETERS },
  contextConfig: { ...DEFAULT_CONTEXT_CONFIG },
  webSearchEnabled: false,

  setTheme: (theme) => {
    try { localStorage.setItem(STORAGE_KEYS.theme, theme); } catch { /* noop */ }
    set((state) => { state.theme = theme; });
  },
  setResolvedTheme: (resolved) => set((state) => { state.resolvedTheme = resolved; }),
  setDensity: (density) => {
    try { localStorage.setItem(STORAGE_KEYS.density, density); } catch { /* noop */ }
    set((state) => { state.density = density; });
  },
  toggleSidebar: () => set((state) => { state.sidebarOpen = !state.sidebarOpen; }),
  setSidebarOpen: (open) => set((state) => { state.sidebarOpen = open; }),
  setSidebarCollapsed: (collapsed) => set((state) => { state.sidebarCollapsed = collapsed; }),
  toggleCanvas: () => set((state) => { state.canvasOpen = !state.canvasOpen; }),
  setCanvasOpen: (open) => set((state) => { state.canvasOpen = open; }),
  toggleFocusMode: () => set((state) => {
    state.focusMode = !state.focusMode;
    if (state.focusMode) {
      state.sidebarOpen = false;
    }
  }),
  setParamDrawerOpen: (open) => set((state) => { state.paramDrawerOpen = open; }),
  setSelectedModelId: (id) => set((state) => { state.selectedModelId = id; }),
  setInferenceParams: (params) => set((state) => { state.inferenceParams = params; }),
  setContextConfig: (config) => set((state) => {
    state.contextConfig = { ...state.contextConfig, ...config };
  }),
  setContextStrategy: (strategy) => set((state) => {
    state.contextConfig.strategy = strategy;
  }),
});

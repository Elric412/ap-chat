export const THEME_MODES = {
  dark: 'dark',
  light: 'light',
  system: 'system',
} as const;

export type ThemeMode = typeof THEME_MODES[keyof typeof THEME_MODES];
export type ResolvedTheme = 'dark' | 'light';

export const DENSITY_MODES = {
  compact: 'compact',
  comfortable: 'comfortable',
  spacious: 'spacious',
} as const;

export type DensityMode = typeof DENSITY_MODES[keyof typeof DENSITY_MODES];

export interface Toast {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  description?: string;
  duration?: number;
  dismissible: boolean;
}

export interface CommandAction {
  id: string;
  label: string;
  description?: string;
  shortcut?: string;
  icon?: string;
  category: string;
  handler: () => void;
}

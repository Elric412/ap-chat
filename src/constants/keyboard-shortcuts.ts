export interface KeyboardShortcut {
  id: string;
  keys: string;
  label: string;
  category: string;
  global: boolean;
}

export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  { id: 'command-palette', keys: 'Meta+k', label: 'Command Palette', category: 'General', global: true },
  { id: 'focus-mode', keys: 'Meta+.', label: 'Toggle Focus Mode', category: 'Layout', global: true },
  { id: 'new-chat', keys: 'Meta+n', label: 'New Conversation', category: 'Conversations', global: true },
  { id: 'toggle-sidebar', keys: 'Meta+b', label: 'Toggle Sidebar', category: 'Layout', global: true },
  { id: 'toggle-theme', keys: 'Meta+Shift+t', label: 'Toggle Theme', category: 'Appearance', global: true },
  { id: 'focus-input', keys: 'Meta+l', label: 'Focus Input', category: 'Chat', global: true },
  { id: 'toggle-params', keys: 'Meta+Shift+p', label: 'Toggle Parameters', category: 'Parameters', global: true },
  { id: 'search-conversations', keys: 'Meta+Shift+f', label: 'Search Conversations', category: 'Conversations', global: true },
] as const;

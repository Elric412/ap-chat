import { useEffect } from 'react';
import { useAppStore } from '../store';
import { KEYBOARD_SHORTCUTS } from '../constants/keyboard-shortcuts';

export function useKeyboard(): void {
  const toggleFocusMode = useAppStore((s) => s.toggleFocusMode);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);

  /* Global keyboard shortcut listener */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const isMeta = e.metaKey || e.ctrlKey;

      for (const shortcut of KEYBOARD_SHORTCUTS) {
        const parts = shortcut.keys.split('+');
        const requiresMeta = parts.includes('Meta');
        const requiresShift = parts.includes('Shift');
        const key = parts[parts.length - 1].toLowerCase();

        if (requiresMeta && !isMeta) continue;
        if (requiresShift && !e.shiftKey) continue;
        if (e.key.toLowerCase() !== key) continue;

        e.preventDefault();

        switch (shortcut.id) {
          case 'focus-mode':
            toggleFocusMode();
            break;
          case 'toggle-sidebar':
            toggleSidebar();
            break;
          default:
            break;
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleFocusMode, toggleSidebar]);
}

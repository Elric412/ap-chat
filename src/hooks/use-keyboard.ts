import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { KEYBOARD_SHORTCUTS } from '../constants/keyboard-shortcuts';

interface UseKeyboardReturn {
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
}

export function useKeyboard(): UseKeyboardReturn {
  const toggleFocusMode = useAppStore((s) => s.toggleFocusMode);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const setParamDrawerOpen = useAppStore((s) => s.setParamDrawerOpen);
  const paramDrawerOpen = useAppStore((s) => s.paramDrawerOpen);
  const createConversation = useAppStore((s) => s.createConversation);
  const navigate = useNavigate();

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

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
        if (!requiresShift && e.shiftKey && parts.length > 1) continue;
        if (e.key.toLowerCase() !== key) continue;

        e.preventDefault();

        switch (shortcut.id) {
          case 'focus-mode':
            toggleFocusMode();
            break;
          case 'toggle-sidebar':
            toggleSidebar();
            break;
          case 'command-palette':
            setCommandPaletteOpen((prev) => !prev);
            break;
          case 'new-chat': {
            const conv = createConversation();
            navigate(`/chat/${conv.id}`);
            break;
          }
          case 'toggle-params':
            setParamDrawerOpen(!paramDrawerOpen);
            break;
          default:
            break;
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleFocusMode, toggleSidebar, createConversation, setParamDrawerOpen, paramDrawerOpen, navigate]);

  return { commandPaletteOpen, setCommandPaletteOpen };
}

/**
 * SlashCommandMenu — Inline prompt library triggered by "/"
 *
 * Provides quick-access prompt templates that inject text into the input.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import styles from './SlashCommandMenu.module.css';

export interface SlashCommand {
  id: string;
  trigger: string;
  label: string;
  description: string;
  template: string;
  category: string;
}

export const BUILTIN_SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'explain',
    trigger: '/explain',
    label: 'Explain',
    description: 'Ask for a detailed explanation',
    template: 'Explain the following in detail:\n\n',
    category: 'General',
  },
  {
    id: 'summarize',
    trigger: '/summarize',
    label: 'Summarize',
    description: 'Summarize content concisely',
    template: 'Summarize the following concisely:\n\n',
    category: 'General',
  },
  {
    id: 'code',
    trigger: '/code',
    label: 'Write Code',
    description: 'Generate code for a task',
    template: 'Write clean, well-documented code for:\n\n',
    category: 'Development',
  },
  {
    id: 'review',
    trigger: '/review',
    label: 'Code Review',
    description: 'Review code for issues',
    template: 'Review the following code for bugs, performance issues, and best practices:\n\n```\n\n```',
    category: 'Development',
  },
  {
    id: 'refactor',
    trigger: '/refactor',
    label: 'Refactor',
    description: 'Refactor and improve code',
    template: 'Refactor the following code to be cleaner and more maintainable:\n\n```\n\n```',
    category: 'Development',
  },
  {
    id: 'debug',
    trigger: '/debug',
    label: 'Debug',
    description: 'Help debug an issue',
    template: 'Help me debug this issue:\n\nExpected behavior: \nActual behavior: \nCode:\n```\n\n```',
    category: 'Development',
  },
  {
    id: 'translate',
    trigger: '/translate',
    label: 'Translate',
    description: 'Translate text to another language',
    template: 'Translate the following to [language]:\n\n',
    category: 'General',
  },
  {
    id: 'pros-cons',
    trigger: '/proscons',
    label: 'Pros & Cons',
    description: 'Analyze pros and cons',
    template: 'List the pros and cons of:\n\n',
    category: 'Analysis',
  },
  {
    id: 'brainstorm',
    trigger: '/brainstorm',
    label: 'Brainstorm',
    description: 'Generate creative ideas',
    template: 'Brainstorm creative ideas for:\n\n',
    category: 'Creative',
  },
  {
    id: 'email',
    trigger: '/email',
    label: 'Draft Email',
    description: 'Draft a professional email',
    template: 'Draft a professional email about:\n\nTone: [professional/casual/formal]\nRecipient: \n\n',
    category: 'Writing',
  },
];

interface SlashCommandMenuProps {
  query: string;
  visible: boolean;
  onSelect: (template: string) => void;
  onClose: () => void;
}

export function SlashCommandMenu({ query, visible, onSelect, onClose }: SlashCommandMenuProps): JSX.Element | null {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.slice(1).toLowerCase(); // remove leading /
    if (!q) return BUILTIN_SLASH_COMMANDS;
    return BUILTIN_SLASH_COMMANDS.filter((cmd) =>
      cmd.trigger.toLowerCase().includes(q) ||
      cmd.label.toLowerCase().includes(q) ||
      cmd.description.toLowerCase().includes(q)
    );
  }, [query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!visible) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
      case 'Tab':
        e.preventDefault();
        if (filtered[selectedIndex]) {
          onSelect(filtered[selectedIndex].template);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [visible, filtered, selectedIndex, onSelect, onClose]);

  useEffect(() => {
    if (visible) {
      window.addEventListener('keydown', handleKeyDown, true);
      return () => window.removeEventListener('keydown', handleKeyDown, true);
    }
  }, [visible, handleKeyDown]);

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!visible || filtered.length === 0) return null;

  return (
    <div className={styles.menu}>
      <div className={styles.menuList} ref={listRef}>
        {filtered.map((cmd, i) => (
          <button
            key={cmd.id}
            className={styles.menuItem}
            data-selected={i === selectedIndex}
            onClick={() => onSelect(cmd.template)}
            onMouseEnter={() => setSelectedIndex(i)}
            type="button"
          >
            <span className={styles.trigger}>{cmd.trigger}</span>
            <span className={styles.label}>{cmd.label}</span>
            <span className={styles.desc}>{cmd.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * CommandPalette — Cmd+K fuzzy-search command palette
 *
 * Actions: navigate, new chat, switch model, toggle theme, export, etc.
 */

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, MessageSquare, Plus, Sun, Moon, Settings, Download,
  Columns2, PanelRight, Eye, SlidersHorizontal, FileJson, FileText, BookOpen,
} from 'lucide-react';
import { useAppStore } from '../../store';
import { MODEL_REGISTRY } from '../../constants/model-registry';
import { PROVIDER_META } from '../../constants/provider-meta';
import { useTheme } from '../../hooks/use-theme';
import styles from './CommandPalette.module.css';

export interface CommandAction {
  id: string;
  label: string;
  category: string;
  icon: React.ReactNode;
  keywords?: string[];
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps): JSX.Element | null {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { resolvedTheme, toggleTheme } = useTheme();

  const conversations = useAppStore((s) => s.conversations);
  const createConversation = useAppStore((s) => s.createConversation);
  const setSelectedModelId = useAppStore((s) => s.setSelectedModelId);
  const toggleCanvas = useAppStore((s) => s.toggleCanvas);
  const toggleFocusMode = useAppStore((s) => s.toggleFocusMode);
  const setParamDrawerOpen = useAppStore((s) => s.setParamDrawerOpen);
  const paramDrawerOpen = useAppStore((s) => s.paramDrawerOpen);
  const setComparisonMode = useAppStore((s) => s.setComparisonMode);
  const setSkillPanelOpen = useAppStore((s) => s.setSkillPanelOpen);
  const skillConfig = useAppStore((s) => s.skillConfig);
  const setSkillMode = useAppStore((s) => s.setSkillMode);
  const actions = useMemo((): CommandAction[] => {
    const list: CommandAction[] = [];

    // Navigation
    list.push({
      id: 'new-chat',
      label: 'New Conversation',
      category: 'Actions',
      icon: <Plus size={16} />,
      keywords: ['new', 'chat', 'conversation', 'create'],
      action: () => {
        const conv = createConversation();
        navigate(`/chat/${conv.id}`);
      },
    });

    list.push({
      id: 'settings',
      label: 'Open Settings',
      category: 'Actions',
      icon: <Settings size={16} />,
      keywords: ['settings', 'keys', 'api', 'vault'],
      action: () => navigate('/settings'),
    });

    list.push({
      id: 'toggle-theme',
      label: `Switch to ${resolvedTheme === 'dark' ? 'Light' : 'Dark'} Mode`,
      category: 'Actions',
      icon: resolvedTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />,
      keywords: ['theme', 'dark', 'light', 'mode'],
      action: toggleTheme,
    });

    list.push({
      id: 'toggle-canvas',
      label: 'Toggle Canvas Panel',
      category: 'Actions',
      icon: <PanelRight size={16} />,
      keywords: ['canvas', 'panel', 'artifact'],
      action: toggleCanvas,
    });

    list.push({
      id: 'toggle-focus',
      label: 'Toggle Focus Mode',
      category: 'Actions',
      icon: <Eye size={16} />,
      keywords: ['focus', 'distraction', 'zen'],
      action: toggleFocusMode,
    });

    list.push({
      id: 'toggle-params',
      label: 'Toggle Parameters Drawer',
      category: 'Actions',
      icon: <SlidersHorizontal size={16} />,
      keywords: ['parameters', 'settings', 'temperature'],
      action: () => setParamDrawerOpen(!paramDrawerOpen),
    });

    list.push({
      id: 'compare-mode',
      label: 'Start Parallel Comparison',
      category: 'Actions',
      icon: <Columns2 size={16} />,
      keywords: ['compare', 'parallel', 'side'],
      action: () => setComparisonMode(true),
    });

    // Skills
    list.push({
      id: 'open-skills',
      label: 'Open Skill Library',
      category: 'Actions',
      icon: <BookOpen size={16} />,
      keywords: ['skills', 'library', 'expertise'],
      action: () => setSkillPanelOpen(true),
    });

    list.push({
      id: 'toggle-skills',
      label: skillConfig.mode === 'disabled' ? 'Enable Skill Library' : 'Disable Skill Library',
      category: 'Actions',
      icon: <BookOpen size={16} />,
      keywords: ['skills', 'toggle', 'enable', 'disable'],
      action: () => setSkillMode(skillConfig.mode === 'disabled' ? 'all' : 'disabled'),
    });

    list.push({
      id: 'export-md',
      label: 'Export as Markdown',
      category: 'Export',
      icon: <FileText size={16} />,
      keywords: ['export', 'markdown', 'download', 'save'],
      action: () => {
        document.dispatchEvent(new CustomEvent('byok:export', { detail: { format: 'markdown' } }));
      },
    });

    list.push({
      id: 'export-json',
      label: 'Export as JSON',
      category: 'Export',
      icon: <FileJson size={16} />,
      keywords: ['export', 'json', 'download', 'data'],
      action: () => {
        document.dispatchEvent(new CustomEvent('byok:export', { detail: { format: 'json' } }));
      },
    });

    // Models
    for (const model of MODEL_REGISTRY.filter((m) => !m.deprecated)) {
      const meta = PROVIDER_META[model.providerId];
      list.push({
        id: `model-${model.id}`,
        label: `Switch to ${model.displayName}`,
        category: 'Models',
        icon: (
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: `var(${meta.colorVar})`,
              display: 'inline-block',
            }}
          />
        ),
        keywords: [model.displayName.toLowerCase(), model.providerId, model.family.toLowerCase()],
        action: () => setSelectedModelId(model.id),
      });
    }

    // Recent conversations
    for (const conv of conversations.slice(0, 8)) {
      list.push({
        id: `conv-${conv.id}`,
        label: conv.title,
        category: 'Conversations',
        icon: <MessageSquare size={16} />,
        keywords: [conv.title.toLowerCase()],
        action: () => navigate(`/chat/${conv.id}`),
      });
    }

    return list;
  }, [
    conversations, createConversation, navigate, resolvedTheme, toggleTheme,
    toggleCanvas, toggleFocusMode, setParamDrawerOpen, paramDrawerOpen,
    setSelectedModelId, setComparisonMode,
  ]);

  const filtered = useMemo(() => {
    if (!query.trim()) return actions;
    const q = query.toLowerCase();
    return actions.filter((a) => {
      if (a.label.toLowerCase().includes(q)) return true;
      if (a.category.toLowerCase().includes(q)) return true;
      return a.keywords?.some((k) => k.includes(q)) ?? false;
    });
  }, [query, actions]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
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
        e.preventDefault();
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].action();
          onClose();
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [filtered, selectedIndex, onClose]);

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!open) return null;

  // Group by category
  const grouped = new Map<string, CommandAction[]>();
  for (const a of filtered) {
    const list = grouped.get(a.category) ?? [];
    list.push(a);
    grouped.set(a.category, list);
  }

  let flatIndex = -1;

  return (
    <div className={styles.overlay}>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div className={styles.palette} role="dialog" aria-label="Command palette" onKeyDown={handleKeyDown}>
        <div className={styles.searchRow}>
          <Search size={16} className={styles.searchIcon} />
          <input
            ref={inputRef}
            className={styles.searchInput}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            placeholder="Type a command…"
            aria-label="Search commands"
          />
        </div>
        <div className={styles.resultList} ref={listRef}>
          {filtered.length === 0 && (
            <div className={styles.emptyResult}>No matching commands</div>
          )}
          {Array.from(grouped.entries()).map(([category, items]) => (
            <div key={category}>
              <div className={styles.categoryLabel}>{category}</div>
              {items.map((item) => {
                flatIndex++;
                const idx = flatIndex;
                return (
                  <button
                    key={item.id}
                    className={styles.resultItem}
                    data-selected={idx === selectedIndex}
                    onClick={() => { item.action(); onClose(); }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    type="button"
                  >
                    <span className={styles.resultIcon}>{item.icon}</span>
                    <span className={styles.resultLabel}>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

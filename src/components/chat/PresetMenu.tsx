/**
 * PresetMenu — Premium categorized preset selector
 * 
 * Agency-grade floating panel with grouped presets,
 * parameter badges, keyboard navigation (↑↓ Enter Esc, 1-9),
 * and framer-motion entrance/exit.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Thermometer, Brain, Hash } from 'lucide-react';
import { getAllPresets, type Preset } from '../../constants/presets';
import type { InferenceParameters } from '../../types/parameters';
import styles from './PresetMenu.module.css';

interface PresetMenuProps {
  open: boolean;
  onClose: () => void;
  onApply: (presetId: string) => void;
}

/* ── Category grouping ── */
const CATEGORY_ORDER = ['General Purpose', 'Coding', 'Writing', 'Analysis'] as const;

function categorize(presets: Preset[]): Map<string, Preset[]> {
  const map = new Map<string, Preset[]>();
  for (const p of presets) {
    const cat = inferCategory(p);
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(p);
  }
  return map;
}

function inferCategory(p: Preset): string {
  const id = p.id.toLowerCase();
  const name = p.name.toLowerCase();
  if (id.includes('code') || name.includes('code') || name.includes('review')) return 'Coding';
  if (id.includes('story') || id.includes('brainstorm') || name.includes('writing') || name.includes('creative') || name.includes('story') || name.includes('brainstorm') || name.includes('technical-writing')) return 'Writing';
  if (id.includes('analy') || id.includes('research') || name.includes('analy') || name.includes('research')) return 'Analysis';
  return 'General Purpose';
}

/* ── Parameter badge helpers ── */
function buildBadges(params: Partial<InferenceParameters>) {
  const badges: { label: string; type: string }[] = [];
  if (params.temperature != null) badges.push({ label: `T ${params.temperature}`, type: 'temp' });
  if (params.topP != null) badges.push({ label: `P ${params.topP}`, type: 'topp' });
  if (params.maxOutputTokens != null) badges.push({ label: `${(params.maxOutputTokens / 1024).toFixed(0)}K`, type: 'tokens' });
  if (params.thinkingEnabled) badges.push({ label: params.thinkingLevel ?? 'on', type: 'thinking' });
  if (params.seed != null) badges.push({ label: `#${params.seed}`, type: 'seed' });
  return badges;
}

export function PresetMenu({ open, onClose, onApply }: PresetMenuProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const presets = useMemo(() => getAllPresets(), []);
  const grouped = useMemo(() => categorize(presets), [presets]);

  // Flat ordered list for keyboard nav
  const flatList = useMemo(() => {
    const result: Preset[] = [];
    for (const cat of CATEGORY_ORDER) {
      const items = grouped.get(cat);
      if (items) result.push(...items);
    }
    // Append any uncategorized
    for (const [cat, items] of grouped) {
      if (!(CATEGORY_ORDER as readonly string[]).includes(cat)) result.push(...items);
    }
    return result;
  }, [grouped]);

  // Reset selection when opening
  useEffect(() => {
    if (open) setSelectedIdx(0);
  }, [open]);

  // Scroll selected item into view
  useEffect(() => {
    if (!open || !bodyRef.current) return;
    const items = bodyRef.current.querySelectorAll('[data-preset-idx]');
    const target = items[selectedIdx] as HTMLElement | undefined;
    target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedIdx, open]);

  // Keyboard handler
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIdx((i) => Math.min(i + 1, flatList.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIdx((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (flatList[selectedIdx]) onApply(flatList[selectedIdx].id);
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        default:
          // Number keys 1-9 for quick select
          if (/^[1-9]$/.test(e.key)) {
            const idx = parseInt(e.key) - 1;
            if (idx < flatList.length) {
              e.preventDefault();
              onApply(flatList[idx].id);
            }
          }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, selectedIdx, flatList, onApply, onClose]);

  // Click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  let globalIdx = 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          <div className={styles.backdrop} />
          <motion.div
            ref={menuRef}
            className={styles.menu}
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 0.68, 0, 1] }}
          >
            {/* Header */}
            <div className={styles.header}>
              <div className={styles.headerLeft}>
                <div className={styles.headerIcon}>
                  <Zap size={14} />
                </div>
                <span className={styles.headerTitle}>Quick Presets</span>
              </div>
              <span className={styles.headerHint}>{flatList.length} presets</span>
            </div>

            {/* Scrollable body */}
            <div className={styles.body} ref={bodyRef}>
              {CATEGORY_ORDER.map((cat) => {
                const items = grouped.get(cat);
                if (!items || items.length === 0) return null;
                return (
                  <div key={cat} className={styles.category}>
                    <div className={styles.categoryLabel}>
                      {cat}
                      <span className={styles.categoryLine} />
                    </div>
                    {items.map((preset) => {
                      const idx = globalIdx++;
                      const badges = buildBadges(preset.parameters);
                      return (
                        <button
                          key={preset.id}
                          className={styles.item}
                          data-selected={selectedIdx === idx}
                          data-preset-idx={idx}
                          onClick={() => onApply(preset.id)}
                          onMouseEnter={() => setSelectedIdx(idx)}
                          type="button"
                        >
                          <span className={styles.shortcutKey}>
                            {idx < 9 ? idx + 1 : '·'}
                          </span>
                          <div className={styles.itemContent}>
                            <span className={styles.itemName}>{preset.name}</span>
                            <span className={styles.itemDesc}>{preset.description}</span>
                            {badges.length > 0 && (
                              <div className={styles.badges}>
                                {badges.map((b, i) => (
                                  <span key={i} className={styles.badge} data-type={b.type}>
                                    {b.type === 'temp' && <Thermometer size={8} />}
                                    {b.type === 'thinking' && <Brain size={8} />}
                                    {b.type === 'seed' && <Hash size={8} />}
                                    {b.label}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Footer with keyboard hints */}
            <div className={styles.footer}>
              <div className={styles.footerHint}>
                <span className={styles.footerKbd}>
                  <span className={styles.kbdKey}>↑</span>
                  <span className={styles.kbdKey}>↓</span>
                  navigate
                </span>
                <span className={styles.footerKbd}>
                  <span className={styles.kbdKey}>↵</span>
                  apply
                </span>
                <span className={styles.footerKbd}>
                  <span className={styles.kbdKey}>1</span>–<span className={styles.kbdKey}>9</span>
                  quick
                </span>
                <span className={styles.footerKbd}>
                  <span className={styles.kbdKey}>esc</span>
                  close
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

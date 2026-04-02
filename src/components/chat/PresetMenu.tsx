/**
 * PresetMenu — Bottom-sheet on mobile, centered modal on desktop
 * 
 * Agency-grade preset selector with grouped presets, parameter badges,
 * keyboard navigation (↑↓ Enter Esc, 1-9), and spring-physics motion.
 * Uses portal to avoid z-index issues.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Thermometer, Brain, Hash } from 'lucide-react';
import { getAllPresets, type Preset } from '../../constants/presets';
import type { InferenceParameters } from '../../types/parameters';
import { useMediaQuery } from '../../hooks/use-media-query';
import styles from './PresetMenu.module.css';

interface PresetMenuProps {
  open: boolean;
  onClose: () => void;
  onApply: (presetId: string) => void;
}

/* ── Easing curves (Impeccable: ease-out-expo for entrances) ── */
const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];
const EASE_IN_QUART: [number, number, number, number] = [0.5, 0, 0.75, 0];

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
  const isMobile = useMediaQuery('(max-width: 768px)');

  const presets = useMemo(() => getAllPresets(), []);
  const grouped = useMemo(() => categorize(presets), [presets]);

  // Flat ordered list for keyboard nav
  const flatList = useMemo(() => {
    const result: Preset[] = [];
    for (const cat of CATEGORY_ORDER) {
      const items = grouped.get(cat);
      if (items) result.push(...items);
    }
    for (const [cat, items] of grouped) {
      if (!(CATEGORY_ORDER as readonly string[]).includes(cat)) result.push(...items);
    }
    return result;
  }, [grouped]);

  useEffect(() => {
    if (open) setSelectedIdx(0);
  }, [open]);

  useEffect(() => {
    if (!open || !bodyRef.current) return;
    const items = bodyRef.current.querySelectorAll('[data-preset-idx]');
    const target = items[selectedIdx] as HTMLElement | undefined;
    target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedIdx, open]);

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

  // Motion variants: bottom-sheet slide on mobile, scale-fade on desktop
  const menuVariants = isMobile
    ? {
        initial: { y: '100%', opacity: 0.8 },
        animate: { y: 0, opacity: 1 },
        exit: { y: '100%', opacity: 0 },
      }
    : {
        initial: { opacity: 0, y: 24, scale: 0.96 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 12, scale: 0.97 },
      };

  const menuTransition = isMobile
    ? { type: 'spring' as const, stiffness: 380, damping: 34, mass: 0.8 }
    : { duration: 0.28, ease: EASE_OUT_EXPO };

  const exitTransition = isMobile
    ? { type: 'spring' as const, stiffness: 500, damping: 40 }
    : { duration: 0.18, ease: EASE_IN_QUART };

  let globalIdx = 0;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
          />
          <motion.div
            ref={menuRef}
            className={styles.menu}
            {...menuVariants}
            transition={menuTransition}
            // @ts-expect-error framer-motion exit transition override
            exit={{
              ...menuVariants.exit,
              transition: exitTransition,
            }}
          >
            {/* Header */}
            <div className={styles.header}>
              <div className={styles.headerLeft}>
                <div className={styles.headerIcon}>
                  <Zap size={16} />
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
                        <motion.button
                          key={preset.id}
                          className={styles.item}
                          data-selected={selectedIdx === idx}
                          data-preset-idx={idx}
                          onClick={() => onApply(preset.id)}
                          onMouseEnter={() => setSelectedIdx(idx)}
                          type="button"
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{
                            duration: 0.22,
                            delay: Math.min(idx * 0.025, 0.15),
                            ease: EASE_OUT_EXPO,
                          }}
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
                                    {b.type === 'temp' && <Thermometer size={9} />}
                                    {b.type === 'thinking' && <Brain size={9} />}
                                    {b.type === 'seed' && <Hash size={9} />}
                                    {b.label}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </motion.button>
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
    </AnimatePresence>,
    document.body
  );
}

/**
 * ModelSelector
 * 
 * Dropdown panel for selecting the active model. Groups by provider,
 * shows capability dots, and indicates missing API keys.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../../store';
import { MODEL_REGISTRY } from '../../constants/model-registry';
import { PROVIDER_META } from '../../constants/provider-meta';
import type { ModelEntry, ProviderId } from '../../types/models';
import styles from './ModelSelector.module.css';

interface ModelSelectorProps {
  open: boolean;
  onClose: () => void;
}

type Ease4 = [number, number, number, number];
const EASE_SILK: Ease4 = [0.19, 1, 0.22, 1];
const EASE_OUT: Ease4 = [0.16, 1, 0.3, 1];
const EASE_SNAP: Ease4 = [0.34, 1.56, 0.64, 1];
const EASE_MECH: Ease4 = [0.22, 0.68, 0.28, 1.0];

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2, ease: EASE_SILK } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

const panelVariants = {
  hidden: { opacity: 0, y: -16, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.35, ease: EASE_SNAP },
  },
  exit: {
    opacity: 0,
    y: -8,
    scale: 0.97,
    transition: { duration: 0.2, ease: EASE_MECH },
  },
};

const mobilePanelVariants = {
  hidden: { opacity: 0, y: 100 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: EASE_OUT },
  },
  exit: {
    opacity: 0,
    y: 60,
    transition: { duration: 0.25, ease: EASE_MECH },
  },
};

const groupVariants = {
  hidden: { opacity: 0 },
  visible: (i: number) => ({
    opacity: 1,
    transition: { delay: i * 0.05, duration: 0.3, ease: EASE_OUT },
  }),
};

export function ModelSelector({ open, onClose }: ModelSelectorProps): JSX.Element | null {
  const selectedModelId = useAppStore((s) => s.selectedModelId);
  const setSelectedModelId = useAppStore((s) => s.setSelectedModelId);
  const keyRecords = useAppStore((s) => s.keyRecords);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  const providerHasKey = useMemo(() => {
    const set = new Set<ProviderId>();
    for (const r of keyRecords) set.add(r.providerId);
    return set;
  }, [keyRecords]);

  /* Focus search input when opened */
  useEffect(() => {
    if (open) {
      setSearch('');
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  /* Close on Escape */
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const filteredModels = useMemo(() => {
    if (!search.trim()) return MODEL_REGISTRY.filter((m) => !m.deprecated);
    const q = search.toLowerCase();
    return MODEL_REGISTRY.filter(
      (m) => !m.deprecated && (
        m.displayName.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        PROVIDER_META[m.providerId].displayName.toLowerCase().includes(q)
      )
    );
  }, [search]);

  const { currentModels, legacyModels } = useMemo(() => {
    const current: ModelEntry[] = [];
    const legacy: ModelEntry[] = [];
    for (const m of filteredModels) {
      if (m.isLegacy) legacy.push(m);
      else current.push(m);
    }
    return { currentModels: current, legacyModels: legacy };
  }, [filteredModels]);

  const currentGrouped = useMemo(() => {
    const map = new Map<ProviderId, ModelEntry[]>();
    for (const m of currentModels) {
      const list = map.get(m.providerId) ?? [];
      list.push(m);
      map.set(m.providerId, list);
    }
    return map;
  }, [currentModels]);

  const legacyGrouped = useMemo(() => {
    const map = new Map<ProviderId, ModelEntry[]>();
    for (const m of legacyModels) {
      const list = map.get(m.providerId) ?? [];
      list.push(m);
      map.set(m.providerId, list);
    }
    return map;
  }, [legacyModels]);

  const [showLegacy, setShowLegacy] = useState(false);

  const handleSelect = useCallback((modelId: string) => {
    setSelectedModelId(modelId);
    onClose();
  }, [setSelectedModelId, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className={styles.overlay}>
          <motion.div
            className={styles.backdrop}
            onClick={onClose}
            aria-hidden="true"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          />
          <motion.div
            className={styles.panel}
            role="listbox"
            aria-label="Model selector"
            variants={isMobile ? mobilePanelVariants : panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div className={styles.searchWrapper}>
              <input
                ref={searchRef}
                className={styles.searchInput}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search models…"
                aria-label="Search models"
              />
            </div>
            <div className={styles.list}>
              {currentGrouped.size === 0 && legacyGrouped.size === 0 && (
                <motion.div
                  className={styles.emptySearch}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, ease: EASE_OUT }}
                >
                  No models match your search
                </motion.div>
              )}
              {Array.from(currentGrouped.entries()).map(([providerId, models], groupIdx) => {
                const meta = PROVIDER_META[providerId];
                const hasKey = providerHasKey.has(providerId);
                return (
                  <motion.div
                    key={providerId}
                    className={styles.providerGroup}
                    custom={groupIdx}
                    variants={groupVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    <div className={styles.providerLabel}>
                      <span
                        className={styles.providerDot}
                        style={{ background: `var(${meta.colorVar})` }}
                        aria-hidden="true"
                      />
                      {meta.displayName}
                      {!hasKey && <span className={styles.noKey}>No key</span>}
                    </div>
                    {models.map((model, modelIdx) => (
                      <motion.button
                        key={model.id}
                        className={styles.modelItem}
                        data-selected={model.id === selectedModelId}
                        onClick={() => handleSelect(model.id)}
                        role="option"
                        aria-selected={model.id === selectedModelId}
                        type="button"
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{
                          delay: groupIdx * 0.05 + modelIdx * 0.03,
                          duration: 0.3,
                          ease: EASE_OUT,
                        }}
                        whileHover={{ x: 3, transition: { duration: 0.15, ease: EASE_SNAP } }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className={styles.modelInfo}>
                          <div className={styles.modelName}>{model.displayName}</div>
                          <div className={styles.modelMeta}>
                            <span>{Math.round(model.contextWindow / 1000)}K ctx</span>
                            <span>${model.pricing.inputPerMillionTokens}/M in</span>
                          </div>
                        </div>
                        <div className={styles.capDots} aria-label="Capabilities">
                          <span className={styles.capDot} data-active={model.capabilities.supportsVision} title="Vision" />
                          <span className={styles.capDot} data-active={model.capabilities.supportsThinking} title="Thinking" />
                          <span className={styles.capDot} data-active={model.capabilities.supportsToolUse} title="Tools" />
                          <span className={styles.capDot} data-active={model.capabilities.supportsWebSearch} title="Search" />
                        </div>
                      </motion.button>
                    ))}
                  </motion.div>
                );
              })}

              {legacyGrouped.size > 0 && (
                <div className={styles.legacySection}>
                  <button
                    className={styles.legacyToggle}
                    onClick={() => setShowLegacy(!showLegacy)}
                    type="button"
                    aria-expanded={showLegacy}
                  >
                    <svg
                      className={styles.chevron}
                      data-open={showLegacy}
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M3 4.5L6 7.5L9 4.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>Legacy Models</span>
                    <span className={styles.legacyCount}>({legacyModels.length})</span>
                  </button>
                  <AnimatePresence>
                    {showLegacy && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: EASE_OUT }}
                        style={{ overflow: 'hidden' }}
                      >
                        {Array.from(legacyGrouped.entries()).map(([providerId, models], groupIdx) => {
                          const meta = PROVIDER_META[providerId];
                          const hasKey = providerHasKey.has(providerId);
                          return (
                            <div key={providerId} className={styles.providerGroup}>
                              <div className={styles.providerLabel}>
                                <span
                                  className={styles.providerDot}
                                  style={{ background: `var(${meta.colorVar})` }}
                                  aria-hidden="true"
                                />
                                {meta.displayName}
                                {!hasKey && <span className={styles.noKey}>No key</span>}
                              </div>
                              {models.map((model) => (
                                <button
                                  key={model.id}
                                  className={styles.modelItem}
                                  data-selected={model.id === selectedModelId}
                                  onClick={() => handleSelect(model.id)}
                                  role="option"
                                  aria-selected={model.id === selectedModelId}
                                  type="button"
                                >
                                  <div className={styles.modelInfo}>
                                    <div className={styles.modelName}>{model.displayName}</div>
                                    <div className={styles.modelMeta}>
                                      <span>{Math.round(model.contextWindow / 1000)}K ctx</span>
                                      <span>${model.pricing.inputPerMillionTokens}/M in</span>
                                    </div>
                                  </div>
                                  <div className={styles.capDots} aria-label="Capabilities">
                                    <span className={styles.capDot} data-active={model.capabilities.supportsVision} title="Vision" />
                                    <span className={styles.capDot} data-active={model.capabilities.supportsThinking} title="Thinking" />
                                    <span className={styles.capDot} data-active={model.capabilities.supportsToolUse} title="Tools" />
                                    <span className={styles.capDot} data-active={model.capabilities.supportsWebSearch} title="Search" />
                                  </div>
                                </button>
                              ))}
                            </div>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

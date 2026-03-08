/**
 * ModelSelector
 * 
 * Dropdown panel for selecting the active model. Groups by provider,
 * shows capability dots, and indicates missing API keys.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAppStore } from '../../store';
import { MODEL_REGISTRY } from '../../constants/model-registry';
import { PROVIDER_META } from '../../constants/provider-meta';
import type { ModelEntry, ProviderId } from '../../types/models';
import styles from './ModelSelector.module.css';

interface ModelSelectorProps {
  open: boolean;
  onClose: () => void;
}

export function ModelSelector({ open, onClose }: ModelSelectorProps): JSX.Element | null {
  const selectedModelId = useAppStore((s) => s.selectedModelId);
  const setSelectedModelId = useAppStore((s) => s.setSelectedModelId);
  const keyRecords = useAppStore((s) => s.keyRecords);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

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

  const grouped = useMemo(() => {
    const map = new Map<ProviderId, ModelEntry[]>();
    for (const m of filteredModels) {
      const list = map.get(m.providerId) ?? [];
      list.push(m);
      map.set(m.providerId, list);
    }
    return map;
  }, [filteredModels]);

  const handleSelect = useCallback((modelId: string) => {
    setSelectedModelId(modelId);
    onClose();
  }, [setSelectedModelId, onClose]);

  if (!open) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div className={styles.panel} role="listbox" aria-label="Model selector">
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
          {grouped.size === 0 && (
            <div className={styles.emptySearch}>No models match your search</div>
          )}
          {Array.from(grouped.entries()).map(([providerId, models]) => {
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
        </div>
      </div>
    </div>
  );
}

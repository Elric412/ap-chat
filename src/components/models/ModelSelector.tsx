/**
 * ModelSelector
 * 
 * Dropdown panel for selecting the active model. Groups by provider,
 * shows capability dots, and indicates missing API keys.
 * Accessible: focus trap, roving tabindex, screen reader announcements.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAppStore } from '../../store';
import { MODEL_REGISTRY } from '../../constants/model-registry';
import { PROVIDER_META } from '../../constants/provider-meta';
import { useFocusTrap } from '../../hooks/use-focus-trap';
import { useRovingFocus } from '../../hooks/use-roving-focus';
import { announce } from '../../hooks/use-announcer';
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

  // Flat list for keyboard navigation
  const flatModels = useMemo(() => {
    const result: ModelEntry[] = [];
    for (const models of grouped.values()) {
      result.push(...models);
    }
    return result;
  }, [grouped]);

  // Focus trap for the panel
  const panelRef = useFocusTrap<HTMLDivElement>({
    active: open,
    onEscape: onClose,
    autoFocus: false, // We manage focus to search input
  });

  // Roving focus for model items
  const { activeIndex, handleKeyDown, getItemProps } = useRovingFocus({
    itemCount: flatModels.length,
    orientation: 'vertical',
    wrap: true,
    onSelect: (index) => {
      const model = flatModels[index];
      if (model) handleSelect(model.id);
    },
  });

  /* Focus search input when opened */
  useEffect(() => {
    if (open) {
      setSearch('');
      requestAnimationFrame(() => searchRef.current?.focus());
      announce('Model selector opened. Use arrow keys to navigate models.');
    }
  }, [open]);

  const handleSelect = useCallback((modelId: string) => {
    const model = MODEL_REGISTRY.find((m) => m.id === modelId);
    setSelectedModelId(modelId);
    announce(`Selected ${model?.displayName ?? modelId}`);
    onClose();
  }, [setSelectedModelId, onClose]);

  // Announce search results count
  useEffect(() => {
    if (open && search.trim()) {
      const count = filteredModels.length;
      announce(`${count} model${count !== 1 ? 's' : ''} found`);
    }
  }, [filteredModels.length, open, search]);

  if (!open) return null;

  let itemIndex = 0;

  return (
    <div className={styles.overlay} role="presentation">
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Select a model"
        onKeyDown={handleKeyDown}
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
            aria-describedby="model-search-hint"
            autoComplete="off"
          />
          <span id="model-search-hint" className="sr-only">
            Type to filter models. Use arrow keys to navigate, Enter to select.
          </span>
        </div>
        <div className={styles.list} role="listbox" aria-label="Available models">
          {grouped.size === 0 && (
            <div className={styles.emptySearch} role="status" aria-live="polite">
              No models match your search
            </div>
          )}
          {Array.from(grouped.entries()).map(([providerId, models]) => {
            const meta = PROVIDER_META[providerId];
            const hasKey = providerHasKey.has(providerId);
            return (
              <div key={providerId} className={styles.providerGroup} role="group" aria-label={meta.displayName}>
                <div className={styles.providerLabel} id={`provider-${providerId}`}>
                  <span
                    className={styles.providerDot}
                    style={{ background: `var(${meta.colorVar})` }}
                    aria-hidden="true"
                  />
                  {meta.displayName}
                  {!hasKey && <span className={styles.noKey} aria-label="No API key configured">(No key)</span>}
                </div>
                {models.map((model) => {
                  const currentIndex = itemIndex++;
                  const itemProps = getItemProps(currentIndex);
                  const capabilities = [
                    model.capabilities.supportsVision && 'Vision',
                    model.capabilities.supportsThinking && 'Thinking',
                    model.capabilities.supportsToolUse && 'Tools',
                    model.capabilities.supportsWebSearch && 'Web Search',
                  ].filter(Boolean).join(', ');

                  return (
                    <button
                      key={model.id}
                      {...itemProps}
                      className={styles.modelItem}
                      data-selected={model.id === selectedModelId}
                      onClick={() => handleSelect(model.id)}
                      role="option"
                      aria-selected={model.id === selectedModelId}
                      aria-describedby={`model-desc-${model.id}`}
                      type="button"
                    >
                      <div className={styles.modelInfo}>
                        <div className={styles.modelName}>{model.displayName}</div>
                        <div className={styles.modelMeta} id={`model-desc-${model.id}`}>
                          <span>{Math.round(model.contextWindow / 1000)}K context</span>
                          <span>${model.pricing.inputPerMillionTokens}/M input tokens</span>
                          {capabilities && <span className="sr-only">Capabilities: {capabilities}</span>}
                        </div>
                      </div>
                      <div className={styles.capDots} aria-hidden="true">
                        <span className={styles.capDot} data-active={model.capabilities.supportsVision} title="Vision" />
                        <span className={styles.capDot} data-active={model.capabilities.supportsThinking} title="Thinking" />
                        <span className={styles.capDot} data-active={model.capabilities.supportsToolUse} title="Tools" />
                        <span className={styles.capDot} data-active={model.capabilities.supportsWebSearch} title="Search" />
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

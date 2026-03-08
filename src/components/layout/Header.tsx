import { useState, useCallback } from 'react';
import { ChevronDown, Settings, SlidersHorizontal, PanelRight, Columns2, Globe } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store';
import { MODEL_REGISTRY } from '../../constants/model-registry';
import { PROVIDER_META } from '../../constants/provider-meta';
import { ModelSelector } from '../models/ModelSelector';
import { Tooltip } from '../shared/Tooltip';
import styles from './Header.module.css';

export function Header(): JSX.Element {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const selectedModelId = useAppStore((s) => s.selectedModelId);
  const paramDrawerOpen = useAppStore((s) => s.paramDrawerOpen);
  const setParamDrawerOpen = useAppStore((s) => s.setParamDrawerOpen);
  const canvasOpen = useAppStore((s) => s.canvasOpen);
  const toggleCanvas = useAppStore((s) => s.toggleCanvas);
  const comparisonMode = useAppStore((s) => s.comparisonMode);
  const setComparisonMode = useAppStore((s) => s.setComparisonMode);
  const webSearchEnabled = useAppStore((s) => s.webSearchEnabled);
  const toggleWebSearch = useAppStore((s) => s.toggleWebSearch);
  const navigate = useNavigate();

  const model = MODEL_REGISTRY.find((m) => m.id === selectedModelId);
  const providerColor = model ? `var(${PROVIDER_META[model.providerId].colorVar})` : 'var(--color-text-3)';
  const supportsSearch = model?.capabilities.supportsWebSearch ?? false;

  const handleToggleSelector = useCallback(() => {
    setSelectorOpen((prev) => !prev);
  }, []);

  const handleToggleComparison = useCallback(() => {
    setComparisonMode(!comparisonMode);
  }, [comparisonMode, setComparisonMode]);

  return (
    <>
      <header className={styles.header}>
        <button
          className={styles.modelTrigger}
          type="button"
          aria-label="Select model"
          onClick={handleToggleSelector}
        >
          <span
            className={styles.providerDot}
            style={{ background: providerColor }}
            aria-hidden="true"
          />
          <span>{model?.displayName ?? 'Select model'}</span>
          <ChevronDown size={14} className={styles.chevron} aria-hidden="true" />
        </button>

        {/* Web Search toggle */}
        <button
          className={styles.searchToggle}
          type="button"
          aria-label={webSearchEnabled ? 'Disable web search' : 'Enable web search'}
          aria-pressed={webSearchEnabled}
          data-active={webSearchEnabled}
          data-supported={supportsSearch}
          onClick={toggleWebSearch}
          title={supportsSearch
            ? (webSearchEnabled ? 'Web search enabled' : 'Enable web search')
            : 'Web search not supported by this model'
          }
          disabled={!supportsSearch}
        >
          <Globe size={14} aria-hidden="true" />
          <span className={styles.searchLabel}>Search</span>
          {webSearchEnabled && supportsSearch && (
            <span className={styles.searchDot} aria-hidden="true" />
          )}
        </button>

        <span className={styles.statusText}>
          {webSearchEnabled && supportsSearch ? 'Search on' : 'Ready'}
        </span>
        <div className={styles.spacer} />
        <button
          className={styles.headerAction}
          type="button"
          aria-label="Toggle parallel compare"
          data-active={comparisonMode}
          onClick={handleToggleComparison}
          title="Parallel inference"
        >
          <Columns2 size={18} aria-hidden="true" />
        </button>
        <button
          className={styles.headerAction}
          type="button"
          aria-label="Toggle canvas"
          data-active={canvasOpen}
          onClick={toggleCanvas}
        >
          <PanelRight size={18} aria-hidden="true" />
        </button>
        <button
          className={styles.headerAction}
          type="button"
          aria-label="Toggle parameters"
          onClick={() => setParamDrawerOpen(!paramDrawerOpen)}
        >
          <SlidersHorizontal size={18} aria-hidden="true" />
        </button>
        <button
          className={styles.headerAction}
          type="button"
          aria-label="Settings"
          onClick={() => navigate('/settings')}
        >
          <Settings size={18} aria-hidden="true" />
        </button>
      </header>
      <ModelSelector open={selectorOpen} onClose={() => setSelectorOpen(false)} />
    </>
  );
}

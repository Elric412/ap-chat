/**
 * ComparisonSetup — Modal for selecting 2–4 models before parallel inference.
 */

import { useCallback } from 'react';
import { X } from 'lucide-react';
import { useAppStore } from '../../store';
import { MODEL_REGISTRY } from '../../constants/model-registry';
import { PROVIDER_META } from '../../constants/provider-meta';
import styles from './ComparisonSetup.module.css';

interface ComparisonSetupProps {
  open: boolean;
  onClose: () => void;
  onStart: () => void;
}

export function ComparisonSetup({ open, onClose, onStart }: ComparisonSetupProps): JSX.Element | null {
  const comparisonModelIds = useAppStore((s) => s.comparisonModelIds);
  const addComparisonModelId = useAppStore((s) => s.addComparisonModelId);
  const removeComparisonModelId = useAppStore((s) => s.removeComparisonModelId);

  const toggleModel = useCallback((modelId: string) => {
    if (comparisonModelIds.includes(modelId)) {
      removeComparisonModelId(modelId);
    } else {
      addComparisonModelId(modelId);
    }
  }, [comparisonModelIds, addComparisonModelId, removeComparisonModelId]);

  const canStart = comparisonModelIds.length >= 2;

  if (!open) return null;

  const activeModels = MODEL_REGISTRY.filter((m) => !m.deprecated);

  return (
    <div className={styles.setupOverlay}>
      <div className={styles.setupBackdrop} onClick={onClose} aria-hidden="true" />
      <div className={styles.setupPanel}>
        <div className={styles.setupHeader}>
          <span className={styles.setupTitle}>Parallel Inference</span>
          <button className={styles.closeBtn} onClick={onClose} type="button" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className={styles.setupBody}>
          <div className={styles.instruction}>
            Select 2–4 models to compare side-by-side. Each will stream independently.
          </div>
          <div className={styles.modelGrid}>
            {activeModels.map((model) => {
              const selected = comparisonModelIds.includes(model.id);
              const meta = PROVIDER_META[model.providerId];
              const disabled = !selected && comparisonModelIds.length >= 4;
              return (
                <button
                  key={model.id}
                  className={styles.modelOption}
                  data-selected={selected}
                  onClick={() => !disabled && toggleModel(model.id)}
                  type="button"
                  disabled={disabled}
                  style={disabled ? { opacity: 'var(--state-disabled-opacity)' } : undefined}
                >
                  <span
                    className={styles.optionDot}
                    style={{ background: `var(${meta.colorVar})` }}
                  />
                  <span className={styles.optionName}>{model.displayName}</span>
                  <span className={styles.optionCount}>
                    ${model.pricing.inputPerMillionTokens}/M
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.setupFooter}>
          <span className={styles.selectedCount}>
            {comparisonModelIds.length}/4 selected
          </span>
          <button
            className={styles.startBtn}
            onClick={onStart}
            disabled={!canStart}
            type="button"
          >
            Start Comparison
          </button>
        </div>
      </div>
    </div>
  );
}

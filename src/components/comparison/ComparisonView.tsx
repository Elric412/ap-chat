/**
 * ComparisonView — Multi-pane parallel inference display
 *
 * Shows 2–4 model outputs side-by-side with diff view and consensus mode.
 */

import { useMemo, useCallback } from 'react';
import { X, GitCompareArrows, Merge } from 'lucide-react';
import { useAppStore } from '../../store';
import { ComparisonPaneView } from './ComparisonPane';
import { computeDiff, generateConsensus } from '../../engine/diff-engine';
import { MODEL_REGISTRY } from '../../constants/model-registry';
import { PROVIDER_META } from '../../constants/provider-meta';
import type { ComparisonViewMode } from '../../store/comparison-slice';
import styles from './ComparisonView.module.css';

export function ComparisonView(): JSX.Element | null {
  const session = useAppStore((s) => s.activeComparison);
  const setViewMode = useAppStore((s) => s.setComparisonViewMode);
  const setConsensusText = useAppStore((s) => s.setConsensusText);
  const clearComparison = useAppStore((s) => s.clearComparison);
  const setComparisonMode = useAppStore((s) => s.setComparisonMode);

  const handleClose = useCallback(() => {
    clearComparison();
    setComparisonMode(false);
  }, [clearComparison, setComparisonMode]);

  const handleViewChange = useCallback((mode: ComparisonViewMode) => {
    setViewMode(mode);

    // Auto-generate consensus when switching to consensus view
    if (mode === 'consensus' && session) {
      const completedTexts = session.panes
        .filter((p) => p.status === 'complete' && p.text.length > 0)
        .map((p) => p.text);
      if (completedTexts.length >= 2) {
        setConsensusText(generateConsensus(completedTexts));
      }
    }
  }, [setViewMode, setConsensusText, session]);

  // Diff segments between first two completed panes
  const diffSegments = useMemo(() => {
    if (!session || session.viewMode !== 'diff') return [];
    const completed = session.panes.filter((p) => p.text.length > 0);
    if (completed.length < 2) return [];
    return computeDiff(completed[0].text, completed[1].text);
  }, [session]);

  if (!session) return null;

  const paneCount = session.panes.length;
  const viewMode = session.viewMode;

  return (
    <div className={styles.comparisonView}>
      <div className={styles.toolbar}>
        <div className={styles.promptPreview}>
          <strong>Comparing:</strong> {session.prompt.slice(0, 80)}
          {session.prompt.length > 80 ? '…' : ''}
        </div>

        <div className={styles.viewTabs}>
          <button
            className={styles.viewTab}
            data-active={viewMode === 'side_by_side'}
            onClick={() => handleViewChange('side_by_side')}
            type="button"
          >
            Side by side
          </button>
          <button
            className={styles.viewTab}
            data-active={viewMode === 'diff'}
            onClick={() => handleViewChange('diff')}
            type="button"
            disabled={paneCount < 2}
          >
            <GitCompareArrows size={12} style={{ marginRight: 4 }} />
            Diff
          </button>
          <button
            className={styles.viewTab}
            data-active={viewMode === 'consensus'}
            onClick={() => handleViewChange('consensus')}
            type="button"
          >
            <Merge size={12} style={{ marginRight: 4 }} />
            Consensus
          </button>
        </div>

        <button
          className={styles.closeBtn}
          onClick={handleClose}
          type="button"
          aria-label="Close comparison"
        >
          <X size={16} />
        </button>
      </div>

      {viewMode === 'side_by_side' && (
        <div className={styles.paneGrid} data-count={paneCount}>
          {session.panes.map((pane) => (
            <ComparisonPaneView key={pane.id} pane={pane} />
          ))}
        </div>
      )}

      {viewMode === 'diff' && (
        <div className={styles.diffView}>
          <DiffHeader panes={session.panes} />
          <div className={styles.diffContent}>
            {diffSegments.length === 0 ? (
              <span style={{ color: 'var(--color-text-3)', fontStyle: 'italic' }}>
                Need at least two completed responses to show diff
              </span>
            ) : (
              diffSegments.map((seg, i) => (
                <span key={i} className={styles.diffSegment} data-type={seg.type}>
                  {seg.text}
                </span>
              ))
            )}
          </div>
        </div>
      )}

      {viewMode === 'consensus' && (
        <div className={styles.consensusView}>
          <div className={styles.consensusHeader}>
            <Merge size={18} className={styles.consensusIcon} />
            Consensus Output
          </div>
          {session.consensusText ? (
            <div className={styles.consensusBody}>{session.consensusText}</div>
          ) : (
            <div className={styles.emptyConsensus}>
              Waiting for multiple models to complete before generating consensus…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Shows labels for the two models being diffed */
function DiffHeader({ panes }: { panes: { modelId: string }[] }): JSX.Element | null {
  if (panes.length < 2) return null;

  const models = panes.slice(0, 2).map((p) => MODEL_REGISTRY.find((m) => m.id === p.modelId));

  return (
    <div className={styles.diffHeader}>
      {models.map((model, i) => {
        const color = model
          ? `var(${PROVIDER_META[model.providerId].colorVar})`
          : 'var(--color-text-3)';
        return (
          <div key={i} className={styles.diffLabel}>
            <span className={styles.diffDot} style={{ background: color }} />
            {model?.displayName ?? panes[i].modelId}
          </div>
        );
      })}
    </div>
  );
}

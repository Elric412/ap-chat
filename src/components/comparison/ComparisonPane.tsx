/**
 * ComparisonPane — Single model output pane in parallel inference view.
 * Displays streaming text, status badge, and token/cost metrics.
 */

import type { ComparisonPane as PaneData } from '../../store/comparison-slice';
import { MODEL_REGISTRY } from '../../constants/model-registry';
import { PROVIDER_META } from '../../constants/provider-meta';
import { formatTokenCount, formatCost } from '../../lib/format';
import styles from './ComparisonPane.module.css';

interface ComparisonPaneProps {
  pane: PaneData;
}

export function ComparisonPaneView({ pane }: ComparisonPaneProps): JSX.Element {
  const model = MODEL_REGISTRY.find((m) => m.id === pane.modelId);
  const providerColor = model
    ? `var(${PROVIDER_META[model.providerId].colorVar})`
    : 'var(--color-text-3)';

  const isStreaming = pane.status === 'streaming';
  const hasOutput = pane.text.length > 0;

  return (
    <div className={styles.pane}>
      <div className={styles.paneHeader}>
        <span
          className={styles.providerDot}
          style={{ background: providerColor }}
          aria-hidden="true"
        />
        <span className={styles.modelName}>
          {model?.displayName ?? pane.modelId}
        </span>
        <span className={styles.statusBadge} data-status={pane.status}>
          {pane.status}
        </span>
      </div>

      <div className={styles.paneBody}>
        {pane.error ? (
          <div style={{ color: 'var(--color-error-text)' }}>{pane.error}</div>
        ) : hasOutput ? (
          <>
            {pane.text}
            {isStreaming && <span className={styles.cursor} />}
          </>
        ) : (
          <div className={styles.emptyBody}>
            {isStreaming ? 'Waiting for response…' : 'No output yet'}
          </div>
        )}
      </div>

      {(pane.status === 'complete' || pane.status === 'aborted') && (
        <div className={styles.paneFooter}>
          {pane.outputTokens > 0 && (
            <span className={styles.metric}>
              {formatTokenCount(pane.outputTokens)} tok
            </span>
          )}
          {pane.costTotal > 0 && (
            <span className={styles.metric} data-type="cost">
              {formatCost(pane.costTotal)}
            </span>
          )}
          {pane.latencyMs !== null && (
            <span className={styles.metric} data-type="latency">
              {(pane.latencyMs / 1000).toFixed(1)}s
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * ContextBar
 * 
 * Live token budget bar + context strategy selector.
 * Shows real-time token usage relative to the model's context window.
 */

import { useMemo } from 'react';
import { useAppStore } from '../../store';
import { MODEL_REGISTRY } from '../../constants/model-registry';
import { calculateLiveTokenUsage } from '../../engine/context-engine';
import { TokenBudgetBar } from './TokenBudgetBar';
import type { ContextStrategy } from '../../engine/context-engine';
import styles from './ContextBar.module.css';

const STRATEGY_LABELS: Record<ContextStrategy, string> = {
  sliding_window: 'Window',
  summarize: 'Summarize',
  semantic: 'Semantic',
};

export function ContextBar(): JSX.Element | null {
  const selectedModelId = useAppStore((s) => s.selectedModelId);
  const contextConfig = useAppStore((s) => s.contextConfig);
  const setContextStrategy = useAppStore((s) => s.setContextStrategy);
  const messageMap = useAppStore((s) => s.messageMap);
  const getActiveBranchMessages = useAppStore((s) => s.getActiveBranchMessages);

  const model = useMemo(
    () => MODEL_REGISTRY.find((m) => m.id === selectedModelId),
    [selectedModelId]
  );

  const budget = (() => {
    if (!model) return null;
    const messages = getActiveBranchMessages();
    if (messages.length === 0) return null;
    return calculateLiveTokenUsage(messages, model, contextConfig);
  })();

  if (!model || !budget) return null;

  return (
    <div className={styles.contextBar}>
      <TokenBudgetBar used={budget.used} max={budget.available} />
      <div className={styles.strategyGroup}>
        {(Object.keys(STRATEGY_LABELS) as ContextStrategy[]).map((s) => (
          <button
            key={s}
            className={styles.strategyBtn}
            data-active={contextConfig.strategy === s}
            onClick={() => setContextStrategy(s)}
            type="button"
            disabled={s === 'semantic'}
            title={s === 'semantic' ? 'Coming soon' : `${STRATEGY_LABELS[s]} strategy`}
          >
            {STRATEGY_LABELS[s]}
          </button>
        ))}
      </div>
      {budget.summaryUsed > 0 && (
        <span className={styles.summaryHint}>
          Summary: ~{Math.round(budget.summaryUsed)} tok
        </span>
      )}
    </div>
  );
}

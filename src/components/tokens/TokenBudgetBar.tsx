/**
 * TokenBudgetBar
 * 
 * Visual indicator of token usage relative to model context window.
 */

import { useMemo } from 'react';
import { formatTokenCount } from '../../lib/format';
import styles from './TokenBudgetBar.module.css';

interface TokenBudgetBarProps {
  used: number;
  max: number;
}

export function TokenBudgetBar({ used, max }: TokenBudgetBarProps): JSX.Element {
  const pct = useMemo(() => Math.min((used / max) * 100, 100), [used, max]);
  const isWarning = pct > 75;
  const isDanger = pct > 90;

  return (
    <div className={styles.bar} aria-label={`Token usage: ${used} of ${max}`}>
      <div className={styles.barTrack}>
        <div
          className={styles.barFill}
          style={{ width: `${pct}%` }}
          data-warning={isWarning && !isDanger}
          data-danger={isDanger}
        />
      </div>
      <span className={styles.barLabel}>
        {formatTokenCount(used)} / {formatTokenCount(max)}
      </span>
    </div>
  );
}

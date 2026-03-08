/**
 * CostDisplay
 * 
 * Shows session or message cost in a compact mono format.
 */

import { formatCost } from '../../lib/format';
import styles from './CostDisplay.module.css';

interface CostDisplayProps {
  totalCost: number;
  label?: string;
}

export function CostDisplay({ totalCost, label }: CostDisplayProps): JSX.Element {
  return (
    <span className={styles.cost} aria-label={`Cost: ${formatCost(totalCost)}`}>
      {label && <span className={styles.costLabel}>{label}</span>}
      {formatCost(totalCost)}
    </span>
  );
}

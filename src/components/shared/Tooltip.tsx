import type { ReactNode } from 'react';
import styles from './Tooltip.module.css';

interface TooltipProps {
  content: string;
  children: ReactNode;
}

export function Tooltip({ content, children }: TooltipProps): JSX.Element {
  return (
    <span className={styles.tooltipTrigger}>
      {children}
      <span className={styles.tooltipContent} role="tooltip">{content}</span>
    </span>
  );
}

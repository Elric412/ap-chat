import styles from './Spinner.module.css';
import { cn } from '../../lib/cn';

interface SpinnerProps {
  size?: number;
  className?: string;
}

export function Spinner({ size = 24, className }: SpinnerProps): JSX.Element {
  return (
    <span
      className={cn(styles.spinner, className)}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    >
      <span className={styles.ring} style={{ width: size, height: size }} />
      <span className={styles.sweep} style={{ width: size, height: size }} />
      <span className={styles.dot} />
    </span>
  );
}

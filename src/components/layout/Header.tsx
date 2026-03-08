import { ChevronDown, Settings, SlidersHorizontal } from 'lucide-react';
import styles from './Header.module.css';

export function Header(): JSX.Element {
  return (
    <header className={styles.header}>
      <button className={styles.modelTrigger} type="button" aria-label="Select model">
        <span
          className={styles.providerDot}
          style={{ background: 'var(--color-provider-anthropic)' }}
          aria-hidden="true"
        />
        <span>Claude Sonnet 4</span>
        <ChevronDown size={14} className={styles.chevron} aria-hidden="true" />
      </button>
      <span className={styles.statusText}>Ready</span>
      <div className={styles.spacer} />
      <button
        className={styles.headerAction}
        type="button"
        aria-label="Toggle parameters"
      >
        <SlidersHorizontal size={18} aria-hidden="true" />
      </button>
      <button
        className={styles.headerAction}
        type="button"
        aria-label="Settings"
      >
        <Settings size={18} aria-hidden="true" />
      </button>
    </header>
  );
}

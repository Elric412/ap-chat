import { MessageSquare } from 'lucide-react';
import { Kbd } from '../shared/Kbd';
import styles from './EmptyState.module.css';

export function EmptyState(): JSX.Element {
  return (
    <div className={styles.emptyState}>
      <div className={styles.iconContainer}>
        <MessageSquare size={28} aria-hidden="true" />
      </div>
      <h1 className={styles.title}>BYOK Chat</h1>
      <p className={styles.subtitle}>
        Multi-model AI chat with your own API keys. Select a model and start a conversation.
      </p>
      <div className={styles.shortcuts}>
        <span className={styles.shortcutHint}>
          <Kbd>⌘</Kbd><Kbd>K</Kbd> Command palette
        </span>
        <span className={styles.shortcutHint}>
          <Kbd>⌘</Kbd><Kbd>N</Kbd> New chat
        </span>
      </div>
    </div>
  );
}

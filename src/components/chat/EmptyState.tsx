import { MessageSquare, Key, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store';
import { Kbd } from '../shared/Kbd';
import styles from './EmptyState.module.css';

export function EmptyState(): JSX.Element {
  const navigate = useNavigate();
  const keyRecords = useAppStore((s) => s.keyRecords);
  const hasKeys = keyRecords.length > 0;

  return (
    <div className={styles.emptyState}>
      <div className={styles.iconContainer}>
        <MessageSquare size={28} aria-hidden="true" />
      </div>
      <h1 className={styles.title}>BYOK Chat</h1>
      <p className={styles.subtitle}>
        Multi-model AI chat with your own API keys. Select a model and start a conversation.
      </p>

      {!hasKeys && (
        <button
          className={styles.setupCta}
          onClick={() => navigate('/settings')}
          type="button"
        >
          <Key size={14} aria-hidden="true" />
          Add your first API key to get started
          <ArrowRight size={14} aria-hidden="true" />
        </button>
      )}

      <div className={styles.shortcuts}>
        <span className={styles.shortcutHint}>
          <Kbd>⌘</Kbd><Kbd>K</Kbd> Command palette
        </span>
        <span className={styles.shortcutHint}>
          <Kbd>⌘</Kbd><Kbd>N</Kbd> New chat
        </span>
        <span className={styles.shortcutHint}>
          <Kbd>/</Kbd> Slash commands
        </span>
      </div>
    </div>
  );
}

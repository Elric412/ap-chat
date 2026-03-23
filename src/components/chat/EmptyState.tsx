import { MessageSquare, Key, ArrowRight, Sparkles, Code2, Lightbulb, PenTool } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store';
import { Kbd } from '../shared/Kbd';
import styles from './EmptyState.module.css';

const STARTER_PROMPTS = [
  {
    icon: Sparkles,
    label: 'Explain',
    prompt: 'Explain quantum computing in simple terms',
    color: 'primary' as const,
  },
  {
    icon: Code2,
    label: 'Code',
    prompt: 'Write a Python function to merge two sorted arrays',
    color: 'secondary' as const,
  },
  {
    icon: Lightbulb,
    label: 'Brainstorm',
    prompt: 'Give me 5 creative startup ideas using AI',
    color: 'warning' as const,
  },
  {
    icon: PenTool,
    label: 'Write',
    prompt: 'Draft a professional email declining a meeting',
    color: 'info' as const,
  },
];

interface EmptyStateProps {
  onSend?: (text: string) => void;
}

export function EmptyState({ onSend }: EmptyStateProps): JSX.Element {
  const navigate = useNavigate();
  const keyRecords = useAppStore((s) => s.keyRecords);
  const hasKeys = keyRecords.length > 0;

  const handlePromptClick = (prompt: string) => {
    onSend?.(prompt);
  };

  return (
    <div className={styles.emptyState}>
      <motion.div
        className={styles.hero}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1] }}
      >
        <div className={styles.orbitalContainer}>
          <div className={styles.orbitalRing} />
          <div className={styles.orbitalRingInner} />
          <div className={styles.iconContainer}>
            <MessageSquare size={24} aria-hidden="true" />
          </div>
        </div>

        <h1 className={styles.title}>BYOK Chat</h1>
        <p className={styles.subtitle}>
          Your keys. Your models. Private conversations with 30+ AI models from 8 providers.
        </p>
      </motion.div>

      {!hasKeys ? (
        <motion.button
          className={styles.setupCta}
          onClick={() => navigate('/settings')}
          type="button"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25, duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
          whileHover={{ scale: 1.03, y: -1 }}
          whileTap={{ scale: 0.97 }}
        >
          <Key size={14} aria-hidden="true" />
          Add your first API key
          <ArrowRight size={14} aria-hidden="true" />
        </motion.button>
      ) : (
        <div className={styles.promptGrid}>
          {STARTER_PROMPTS.map((sp, i) => (
            <motion.button
              key={sp.label}
              className={styles.promptCard}
              data-color={sp.color}
              onClick={() => handlePromptClick(sp.prompt)}
              type="button"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.06, duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
              whileHover={{ y: -2, scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
            >
              <sp.icon size={16} className={styles.promptIcon} aria-hidden="true" />
              <span className={styles.promptLabel}>{sp.label}</span>
              <span className={styles.promptText}>{sp.prompt}</span>
            </motion.button>
          ))}
        </div>
      )}

      <motion.div
        className={styles.shortcuts}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.4 }}
      >
        <span className={styles.shortcutHint}>
          <Kbd>⌘</Kbd><Kbd>K</Kbd> Command palette
        </span>
        <span className={styles.shortcutHint}>
          <Kbd>⌘</Kbd><Kbd>N</Kbd> New chat
        </span>
        <span className={styles.shortcutHint}>
          <Kbd>/</Kbd> Slash commands
        </span>
      </motion.div>
    </div>
  );
}

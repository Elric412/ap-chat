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
    prompt: 'Draft a professional email declining a meeting politely',
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
      <div className={styles.hero}>
        <div className={styles.orbitalContainer}>
          <div className={styles.orbitalRing} />
          <div className={styles.orbitalRingInner} />
          <div className={styles.iconContainer}>
            <MessageSquare size={24} aria-hidden="true" />
          </div>
        </div>

        <h1 className={styles.title}>BYOK Chat</h1>
        <p className={styles.subtitle}>
          Your keys, your models, your conversations.
        </p>
      </div>

      {!hasKeys ? (
        <button
          className={styles.setupCta}
          onClick={() => navigate('/settings')}
          type="button"
        >
          <Key size={14} aria-hidden="true" />
          Add your first API key
          <ArrowRight size={14} aria-hidden="true" />
        </button>
      ) : (
        <div className={styles.promptGrid}>
          {STARTER_PROMPTS.map((sp) => (
            <button
              key={sp.label}
              className={styles.promptCard}
              data-color={sp.color}
              onClick={() => handlePromptClick(sp.prompt)}
              type="button"
            >
              <sp.icon size={16} className={styles.promptIcon} aria-hidden="true" />
              <span className={styles.promptLabel}>{sp.label}</span>
              <span className={styles.promptText}>{sp.prompt}</span>
            </button>
          ))}
        </div>
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

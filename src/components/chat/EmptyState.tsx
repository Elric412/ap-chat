import { Key, ArrowRight, Sparkles, Code2, Lightbulb, PenTool } from 'lucide-react';
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
      {/* Asymmetric hero — left-aligned (centered BANNED for DESIGN_VARIANCE > 4) */}
      <motion.div
        className={styles.hero}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className={styles.heroContent}>
          <div className={styles.tagline}>
            <span className={styles.taglineDot} aria-hidden="true" />
            <span>Your keys, your models</span>
          </div>
          <h1 className={styles.title}>BYOK Chat</h1>
          <p className={styles.subtitle}>
            Private conversations with 30+ AI models across 8 providers. No data leaves your device.
          </p>

          {!hasKeys && (
            <motion.button
              className={styles.setupCta}
              onClick={() => navigate('/settings')}
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.2,
                type: 'spring',
                stiffness: 400,
                damping: 28,
              }}
              whileTap={{ scale: 0.97, y: 1 }}
            >
              <Key size={14} aria-hidden="true" />
              Add your first API key
              <ArrowRight size={14} aria-hidden="true" />
            </motion.button>
          )}
        </div>

        {/* Decorative orbital — offset right */}
        <div className={styles.orbitalContainer} aria-hidden="true">
          <div className={styles.orbitalRing} />
          <div className={styles.orbitalRingInner} />
          <div className={styles.orbitalGlow} />
        </div>
      </motion.div>

      {/* Prompt grid — asymmetric 2-col zig-zag on desktop */}
      {hasKeys && (
        <div className={styles.promptGrid}>
          {STARTER_PROMPTS.map((sp, i) => (
            <motion.button
              key={sp.label}
              className={styles.promptCard}
              data-color={sp.color}
              onClick={() => handlePromptClick(sp.prompt)}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.12 + i * 0.04,
                type: 'spring',
                stiffness: 380,
                damping: 26,
              }}
              whileHover={{ y: -3, transition: { type: 'spring', stiffness: 500, damping: 30 } }}
              whileTap={{ scale: 0.98, y: 1 }}
            >
              <div className={styles.promptIconWrap}>
                <sp.icon size={15} className={styles.promptIcon} aria-hidden="true" />
              </div>
              <div className={styles.promptBody}>
                <span className={styles.promptLabel}>{sp.label}</span>
                <span className={styles.promptText}>{sp.prompt}</span>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      <motion.div
        className={styles.shortcuts}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.3 }}
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

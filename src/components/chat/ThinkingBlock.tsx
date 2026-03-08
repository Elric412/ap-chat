/**
 * ThinkingBlock
 * 
 * Collapsible block that renders extended thinking content.
 * Shows a live streaming indicator with elapsed time during generation,
 * and final token count when complete.
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain } from 'lucide-react';
import { formatTokenCount } from '../../lib/format';
import styles from './ThinkingBlock.module.css';

// Typed easing tuples for framer-motion
type Ease4 = [number, number, number, number];
const EASE_SILK: Ease4 = [0.19, 1, 0.22, 1];
const EASE_OUT: Ease4 = [0.16, 1, 0.3, 1];
const EASE_SNAP: Ease4 = [0.34, 1.56, 0.64, 1];
const EASE_BREATH: Ease4 = [0.37, 0, 0.63, 1];

const contentVariants = {
  collapsed: {
    height: 0,
    opacity: 0,
    transition: {
      height: { duration: 0.35, ease: EASE_SILK },
      opacity: { duration: 0.2, ease: EASE_SILK },
    },
  },
  expanded: {
    height: 'auto' as const,
    opacity: 1,
    transition: {
      height: { duration: 0.4, ease: EASE_OUT },
      opacity: { duration: 0.3, delay: 0.1, ease: EASE_OUT },
    },
  },
};

export function ThinkingBlock({ content, tokenCount, isStreaming, startTime }: ThinkingBlockProps): JSX.Element {
  const [elapsed, setElapsed] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  /* Elapsed timer while streaming thinking */
  useEffect(() => {
    if (!isStreaming || !startTime) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isStreaming, startTime]);

  /* Auto-scroll thinking content during streaming */
  useEffect(() => {
    if (isStreaming && isOpen && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content, isStreaming, isOpen]);

  const summaryText = isStreaming
    ? `Thinking${elapsed > 0 ? ` · ${elapsed}s` : '…'}`
    : `Thinking${tokenCount > 0 ? ` · ${formatTokenCount(tokenCount)} tokens` : ''}`;

  return (
    <motion.div
      className={styles.block}
      data-streaming={isStreaming}
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
    >
      <button
        className={styles.summary}
        onClick={() => setIsOpen((prev) => !prev)}
        type="button"
        aria-expanded={isOpen}
        aria-label={summaryText}
      >
        <motion.span
          animate={isStreaming ? { rotate: [0, 10, -10, 0] } : { rotate: 0 }}
          transition={isStreaming ? { duration: 2, repeat: Infinity, ease: EASE_BREATH } : { duration: 0.3 }}
        >
          <Brain size={14} className={styles.icon} aria-hidden="true" />
        </motion.span>
        <span className={styles.label}>{summaryText}</span>
        {isStreaming && <span className={styles.pulse} aria-hidden="true" />}
        <motion.span
          className={styles.chevron}
          animate={{ rotate: isOpen ? 90 : 0 }}
          transition={{ duration: 0.25, ease: EASE_SNAP }}
          aria-hidden="true"
        >
          ▸
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            className={styles.content}
            ref={contentRef}
            variants={contentVariants}
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            style={{ overflow: 'hidden' }}
          >
            <div className={styles.contentInner}>
              {content || 'Thinking…'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * ThinkingBlock
 * 
 * Collapsible block that renders extended thinking content.
 * Shows a live streaming indicator with elapsed time during generation,
 * and final token count when complete.
 */

import { useState, useEffect, useRef } from 'react';
import { Brain } from 'lucide-react';
import { formatTokenCount } from '../../lib/format';
import styles from './ThinkingBlock.module.css';

interface ThinkingBlockProps {
  content: string;
  tokenCount: number;
  isStreaming: boolean;
  startTime?: number;
}

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
    <div className={styles.block} data-streaming={isStreaming}>
      <button
        className={styles.summary}
        onClick={() => setIsOpen((prev) => !prev)}
        type="button"
        aria-expanded={isOpen}
        aria-label={summaryText}
      >
        <Brain size={14} className={styles.icon} aria-hidden="true" />
        <span className={styles.label}>{summaryText}</span>
        {isStreaming && <span className={styles.pulse} aria-hidden="true" />}
        <span className={styles.chevron} data-open={isOpen} aria-hidden="true">▸</span>
      </button>
      {isOpen && (
        <div className={styles.content} ref={contentRef}>
          {content || 'Thinking…'}
        </div>
      )}
    </div>
  );
}

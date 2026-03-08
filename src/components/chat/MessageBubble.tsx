/**
 * MessageBubble
 * 
 * Renders a single message node with role-specific styling.
 * Supports thinking blocks, tool call cards, search citations,
 * streaming cursor, and branch navigation.
 */

import { useState, useCallback, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import type { MessageNode } from '../../types/messages';
import { useAppStore } from '../../store';
import { BranchNavigator } from './BranchNavigator';
import { AttachmentChips } from './AttachmentChips';
import { StreamCursor } from './StreamCursor';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolCallCard } from './ToolCallCard';
import { WebSearchCitations } from './WebSearchCitation';
import { formatTime, formatTokenCount, formatCost } from '../../lib/format';
import { Code2, Pin, Copy, Check } from 'lucide-react';
import { putMessage } from '../../db/messages-repo';
import styles from './MessageBubble.module.css';

interface MessageBubbleProps {
  message: MessageNode;
  onApproveToolCall?: (messageId: string, toolCallId: string) => void;
  onDenyToolCall?: (messageId: string, toolCallId: string) => void;
  style?: CSSProperties;
  index?: number;
}

// Bespoke motion variants — cinematic message entrances
const bubbleVariants = {
  hidden: (isUser: boolean) => ({
    opacity: 0,
    y: 16,
    x: isUser ? 8 : -8,
    scale: 0.97,
  }),
  visible: {
    opacity: 1,
    y: 0,
    x: 0,
    scale: 1,
    transition: {
      duration: 0.45,
      ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
    },
  },
};

export function MessageBubble({ message, onApproveToolCall, onDenyToolCall, style, index = 0 }: MessageBubbleProps): JSX.Element {
  const messageMap = useAppStore((s) => s.messageMap);
  const [copied, setCopied] = useState(false);

  const textContent = message.content
    .filter((p) => p.type === 'text')
    .map((p) => (p as { type: 'text'; text: string }).text)
    .join('\n');

  const timestamp = new Date(message.timestamp);
  const timeStr = formatTime(timestamp);

  const isAssistant = message.role === 'assistant';
  const isUser = message.role === 'user';
  const isStreaming = message.status === 'streaming';

  // Check if this node has siblings (for branch navigation)
  const parentNode = message.parentId ? messageMap.get(message.parentId) : null;
  const hasSiblings = parentNode ? parentNode.childIds.length > 1 : false;
  const siblingIndex = parentNode ? parentNode.childIds.indexOf(message.id) : 0;
  const siblingCount = parentNode ? parentNode.childIds.length : 1;

  const hasToolCalls = message.toolCalls.length > 0;
  const hasCitations = message.webSearchResults.length > 0;
  const hasArtifacts = message.artifactRefs.length > 0;
  const isPinned = message.metadata.pinned;

  const handleViewArtifact = (artifactId: string) => {
    useAppStore.getState().setActiveArtifact(artifactId);
    useAppStore.getState().setCanvasOpen(true);
  };

  const handleTogglePin = () => {
    useAppStore.setState((state) => {
      const node = state.messageMap.get(message.id);
      if (node) {
        node.metadata.pinned = !node.metadata.pinned;
        node._clock += 1;
      }
    });
    const updated = useAppStore.getState().messageMap.get(message.id);
    if (updated) void putMessage(updated);
  };

  const handleCopy = useCallback(async () => {
    if (!textContent) return;
    try {
      await navigator.clipboard.writeText(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }, [textContent]);

  return (
    <motion.div
      className={styles.bubble}
      data-role={message.role}
      data-status={message.status}
      data-pinned={isPinned}
      style={style}
      custom={isUser}
      variants={bubbleVariants}
      initial="hidden"
      animate="visible"
      transition={{
        delay: Math.min(index * 0.04, 0.2),
      }}
      layout="position"
      layoutId={message.id}
    >
      <div className={styles.header}>
        <div className={styles.roleIndicator}>
          {isUser && (
            <span className={styles.monogram} aria-hidden="true">U</span>
          )}
          {isAssistant && (
            <span className={styles.providerDot} aria-hidden="true" />
          )}
          <span className={styles.roleLabel}>
            {isUser ? 'You' : isAssistant ? (message.model ?? 'Assistant') : message.role}
          </span>
        </div>

        <div className={styles.actions}>
          {textContent && !isStreaming && (
            <button
              className={styles.actionBtn}
              onClick={handleCopy}
              type="button"
              aria-label={copied ? 'Copied' : 'Copy message'}
              title={copied ? 'Copied!' : 'Copy to clipboard'}
              data-copied={copied}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          )}
          <button
            className={styles.actionBtn}
            data-pinned={isPinned}
            onClick={handleTogglePin}
            type="button"
            aria-label={isPinned ? 'Unpin message' : 'Pin message'}
            title={isPinned ? 'Pinned — always included in context' : 'Pin to always include in context'}
          >
            <Pin size={12} />
          </button>
        </div>

        <span className={styles.timestamp}>{timeStr}</span>
      </div>

      {/* Thinking block — shown above main content */}
      {isAssistant && message.thinkingContent && (
        <ThinkingBlock
          content={message.thinkingContent}
          tokenCount={message.tokenCounts.thinking}
          isStreaming={isStreaming && textContent.length === 0}
          startTime={message.timestamp}
        />
      )}

      {/* Attachment indicators (user messages) */}
      {isUser && message.attachmentIds.length > 0 && (
        <AttachmentChips attachmentIds={message.attachmentIds} content={message.content} />
      )}

      {/* Main text content */}
      <div className={styles.content}>
        {textContent || (!isStreaming && isAssistant ? <span className={styles.emptyResponse}>Empty response</span> : null)}
        {isStreaming && <StreamCursor visible={true} />}
      </div>

      {/* Tool call cards */}
      {hasToolCalls && (
        <div className={styles.toolCalls}>
          {message.toolCalls.map((tc) => (
            <ToolCallCard
              key={tc.id}
              toolCall={tc}
              onApprove={(id) => onApproveToolCall?.(message.id, id)}
              onDeny={(id) => onDenyToolCall?.(message.id, id)}
            />
          ))}
        </div>
      )}

      {/* Web search citations */}
      {hasCitations && (
        <WebSearchCitations results={message.webSearchResults} />
      )}

      {/* Artifact chips */}
      {hasArtifacts && (
        <div className={styles.artifactChips}>
          {message.artifactRefs.map((refId) => (
            <button
              key={refId}
              className={styles.artifactChip}
              onClick={() => handleViewArtifact(refId)}
              type="button"
            >
              <Code2 size={12} aria-hidden="true" />
              View artifact
            </button>
          ))}
        </div>
      )}

      {/* Footer with token/cost metadata */}
      {isAssistant && !isStreaming && (
        <div className={styles.footer}>
          {message.tokenCounts.input > 0 && (
            <>
              <span className={styles.footerItem}>
                In: {formatTokenCount(message.tokenCounts.input)}
              </span>
              <span className={styles.footerSeparator}>·</span>
            </>
          )}
          {message.tokenCounts.output > 0 && (
            <>
              <span className={styles.footerItem}>
                Out: {formatTokenCount(message.tokenCounts.output)}
              </span>
              <span className={styles.footerSeparator}>·</span>
            </>
          )}
          {message.tokenCounts.thinking > 0 && (
            <>
              <span className={styles.footerItem}>
                Think: {formatTokenCount(message.tokenCounts.thinking)}
              </span>
              <span className={styles.footerSeparator}>·</span>
            </>
          )}
          {message.tokenCounts.cached > 0 && (
            <>
              <span className={styles.cachedItem}>
                Cached: {formatTokenCount(message.tokenCounts.cached)}
              </span>
              <span className={styles.footerSeparator}>·</span>
            </>
          )}
          {message.costEstimate.totalCost > 0 && (
            <span className={styles.costItem}>
              {formatCost(message.costEstimate.totalCost)}
            </span>
          )}
          {message.latency !== null && (
            <>
              <span className={styles.footerSeparator}>·</span>
              <span className={styles.footerItem}>{(message.latency / 1000).toFixed(1)}s</span>
            </>
          )}
          {message.status === 'error' && (
            <span className={styles.statusBadge} data-status="error">
              {message.error?.message ?? 'Error'}
            </span>
          )}
          {message.status === 'aborted' && (
            <span className={styles.statusBadge} data-status="aborted">Stopped</span>
          )}
        </div>
      )}

      {hasSiblings && parentNode && (
        <div className={styles.branchNav}>
          <BranchNavigator
            parentId={parentNode.id}
            currentIndex={siblingIndex}
            totalSiblings={siblingCount}
          />
        </div>
      )}
    </motion.div>
  );
}

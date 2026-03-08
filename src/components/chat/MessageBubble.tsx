import type { MessageNode } from '../../types/messages';
import { useAppStore } from '../../store';
import { BranchNavigator } from './BranchNavigator';
import { StreamCursor } from './StreamCursor';
import { formatTime, formatTokenCount, formatCost } from '../../lib/format';
import styles from './MessageBubble.module.css';

interface MessageBubbleProps {
  message: MessageNode;
}

export function MessageBubble({ message }: MessageBubbleProps): JSX.Element {
  const messageMap = useAppStore((s) => s.messageMap);

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

  return (
    <div className={styles.bubble} data-role={message.role} data-status={message.status}>
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
        <span className={styles.timestamp}>{timeStr}</span>
      </div>

      <div className={styles.content}>
        {textContent}
        {isStreaming && <StreamCursor visible={true} />}
      </div>

      {/* Thinking block */}
      {isAssistant && message.thinkingContent && (
        <details className={styles.thinkingBlock}>
          <summary className={styles.thinkingSummary}>
            Thinking{message.tokenCounts.thinking > 0 ? ` (${formatTokenCount(message.tokenCounts.thinking)} tokens)` : ''}
          </summary>
          <div className={styles.thinkingContent}>{message.thinkingContent}</div>
        </details>
      )}

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
    </div>
  );
}

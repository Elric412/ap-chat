/**
 * MessageBubble
 * 
 * Renders a single message node with role-specific styling.
 * Supports thinking blocks, tool call cards, search citations,
 * streaming cursor, and branch navigation.
 */

import type { MessageNode } from '../../types/messages';
import { useAppStore } from '../../store';
import { BranchNavigator } from './BranchNavigator';
import { AttachmentChips } from './AttachmentChips';
import { StreamCursor } from './StreamCursor';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolCallCard } from './ToolCallCard';
import { WebSearchCitations } from './WebSearchCitation';
import { formatTime, formatTokenCount, formatCost } from '../../lib/format';
import { Code2, Pin } from 'lucide-react';
import { putMessage } from '../../db/messages-repo';
import styles from './MessageBubble.module.css';

interface MessageBubbleProps {
  message: MessageNode;
  onApproveToolCall?: (messageId: string, toolCallId: string) => void;
  onDenyToolCall?: (messageId: string, toolCallId: string) => void;
}

export function MessageBubble({ message, onApproveToolCall, onDenyToolCall }: MessageBubbleProps): JSX.Element {
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

  return (
    <div className={styles.bubble} data-role={message.role} data-status={message.status} data-pinned={isPinned}>
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
        <button
          className={styles.pinBtn}
          data-pinned={isPinned}
          onClick={handleTogglePin}
          type="button"
          aria-label={isPinned ? 'Unpin message' : 'Pin message'}
          title={isPinned ? 'Pinned — always included in context' : 'Pin to always include in context'}
        >
          <Pin size={12} />
        </button>
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
        {textContent}
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
    </div>
  );
}

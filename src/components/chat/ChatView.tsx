import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../../store';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { EmptyState } from './EmptyState';
import { ContextBar } from '../tokens/ContextBar';
import type { ProcessedAttachment } from '../../engine/attachment-processor';
import styles from './ChatView.module.css';

interface ChatViewProps {
  conversationId: string;
  rootNodeId: string;
  onSend: (text: string, attachments?: ProcessedAttachment[]) => void;
  isStreaming?: boolean;
  onAbort?: () => void;
  onApproveToolCall?: (messageId: string, toolCallId: string) => void;
  onDenyToolCall?: (messageId: string, toolCallId: string) => void;
}

export function ChatView({ conversationId, rootNodeId, onSend, isStreaming, onAbort, onApproveToolCall, onDenyToolCall }: ChatViewProps): JSX.Element {
  const loadMessages = useAppStore((s) => s.loadMessages);
  const messagesLoading = useAppStore((s) => s.messagesLoading);
  const getActiveBranchMessages = useAppStore((s) => s.getActiveBranchMessages);
  const messageMap = useAppStore((s) => s.messageMap);

  const scrollRef = useRef<HTMLDivElement>(null);
  const messages = getActiveBranchMessages();

  useEffect(() => {
    void loadMessages(conversationId);
  }, [conversationId, loadMessages]);

  // Smooth scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messageMap]);

  // Announce streaming status to screen readers
  useEffect(() => {
    const statusEl = document.getElementById('stream-status');
    if (!statusEl) return;
    statusEl.textContent = isStreaming ? 'Model is generating a response…' : '';
  }, [isStreaming]);

  const visibleMessages = messages.filter((m) => m.role === 'user' || m.role === 'assistant');

  const handleSend = useCallback((text: string, attachments?: ProcessedAttachment[]) => {
    onSend(text, attachments);
    // Scroll after a tick so the new message renders first
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, [onSend]);

  if (messagesLoading) {
    return <div className={styles.chatView} role="region" aria-label="Chat"><EmptyState /></div>;
  }

  return (
    <div className={styles.chatView} role="region" aria-label="Chat conversation">
      <ContextBar />
      <div
        className={styles.messageList}
        ref={scrollRef}
        role="log"
        aria-label="Messages"
        aria-live="polite"
        aria-relevant="additions"
      >
        <div className={styles.messageListInner}>
          {visibleMessages.length === 0 ? (
            <EmptyState onSend={handleSend} />
          ) : (
            <>
              {visibleMessages.map((msg, i) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  onApproveToolCall={onApproveToolCall}
                  onDenyToolCall={onDenyToolCall}
                  style={{ animationDelay: `${Math.min(i * 30, 150)}ms` }}
                />
              ))}
              {/* Scroll anchor */}
              <div className={styles.scrollAnchor} />
            </>
          )}
        </div>
      </div>
      <div className={styles.inputWrapper}>
        <div className={styles.inputInner}>
          <ChatInput
            onSend={handleSend}
            disabled={isStreaming}
            isStreaming={isStreaming}
            onAbort={onAbort}
            conversationId={conversationId}
          />
        </div>
      </div>
    </div>
  );
}

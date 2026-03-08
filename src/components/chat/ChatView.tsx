import { useEffect, useRef } from 'react';
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

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messageMap]);

  // Announce streaming status to screen readers
  useEffect(() => {
    const statusEl = document.getElementById('stream-status');
    if (!statusEl) return;
    statusEl.textContent = isStreaming ? 'Model is generating a response…' : '';
  }, [isStreaming]);

  const visibleMessages = messages.filter((m) => m.role === 'user' || m.role === 'assistant');

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
            <EmptyState />
          ) : (
            visibleMessages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onApproveToolCall={onApproveToolCall}
                onDenyToolCall={onDenyToolCall}
              />
            ))
          )}
        </div>
      </div>
      <div className={styles.inputWrapper}>
        <div className={styles.inputInner}>
          <ChatInput
            onSend={onSend}
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

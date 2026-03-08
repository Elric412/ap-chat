import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppStore } from '../../store';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { EmptyState } from './EmptyState';
import styles from './ChatView.module.css';

interface ChatViewProps {
  conversationId: string;
  rootNodeId: string;
  onSend: (text: string) => void;
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

  /* Load messages when conversation changes */
  useEffect(() => {
    void loadMessages(conversationId);
  }, [conversationId, loadMessages]);

  /* Auto-scroll on new messages */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messageMap]);

  // Filter to only user/assistant messages (skip root system node)
  const visibleMessages = messages.filter((m) => m.role === 'user' || m.role === 'assistant');

  if (messagesLoading) {
    return <div className={styles.chatView}><EmptyState /></div>;
  }

  return (
    <div className={styles.chatView}>
      <div className={styles.messageList} ref={scrollRef}>
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
          />
        </div>
      </div>
    </div>
  );
}

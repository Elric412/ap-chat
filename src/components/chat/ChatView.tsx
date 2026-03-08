import { useEffect, useRef, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../../store';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { EmptyState } from './EmptyState';
import { ContextBar } from '../tokens/ContextBar';
import { ArrowDown } from 'lucide-react';
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
  const [showScrollBtn, setShowScrollBtn] = useState(false);
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

  // Track scroll position for scroll-to-bottom FAB
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollBtn(distFromBottom > 200);
    };
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, []);

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, []);

  // Announce streaming status to screen readers
  useEffect(() => {
    const statusEl = document.getElementById('stream-status');
    if (!statusEl) return;
    statusEl.textContent = isStreaming ? 'Model is generating a response…' : '';
  }, [isStreaming]);

  const visibleMessages = messages.filter((m) => m.role === 'user' || m.role === 'assistant');

  const handleSend = useCallback((text: string, attachments?: ProcessedAttachment[]) => {
    onSend(text, attachments);
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
                  index={i}
                  onApproveToolCall={onApproveToolCall}
                  onDenyToolCall={onDenyToolCall}
                />
              ))}
              <div className={styles.scrollAnchor} />
            </>
          )}
        </div>
      </div>

      {/* Scroll-to-bottom FAB */}
      <AnimatePresence>
        {showScrollBtn && (
          <motion.button
            className={styles.scrollFab}
            onClick={scrollToBottom}
            type="button"
            aria-label="Scroll to bottom"
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <ArrowDown size={16} />
          </motion.button>
        )}
      </AnimatePresence>

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

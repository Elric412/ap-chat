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

type Ease4 = [number, number, number, number];
const EASE_SILK: Ease4 = [0.19, 1, 0.22, 1];
const EASE_OUT: Ease4 = [0.16, 1, 0.3, 1];
const EASE_SNAP: Ease4 = [0.34, 1.56, 0.64, 1];

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
    return (
      <div className={styles.chatView} role="region" aria-label="Chat">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.19, 1, 0.22, 1] }}
        >
          <EmptyState />
        </motion.div>
      </div>
    );
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
          <AnimatePresence mode="popLayout">
            {visibleMessages.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              >
                <EmptyState onSend={handleSend} />
              </motion.div>
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
          </AnimatePresence>
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
            initial={{ opacity: 0, scale: 0.6, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.6, y: 16 }}
            transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
            whileHover={{ scale: 1.15, boxShadow: '0 8px 32px hsl(230, 20%, 2%, 0.5)' }}
            whileTap={{ scale: 0.88 }}
          >
            <ArrowDown size={16} />
          </motion.button>
        )}
      </AnimatePresence>

      <motion.div
        className={styles.inputWrapper}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className={styles.inputInner}>
          <ChatInput
            onSend={handleSend}
            disabled={isStreaming}
            isStreaming={isStreaming}
            onAbort={onAbort}
            conversationId={conversationId}
          />
        </div>
      </motion.div>
    </div>
  );
}

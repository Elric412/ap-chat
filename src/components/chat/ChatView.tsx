import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../../store';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { EmptyState } from './EmptyState';
import styles from './ChatView.module.css';

interface ChatViewProps {
  conversationId: string;
  rootNodeId: string;
}

export function ChatView({ conversationId, rootNodeId }: ChatViewProps): JSX.Element {
  const loadMessages = useAppStore((s) => s.loadMessages);
  const messagesLoading = useAppStore((s) => s.messagesLoading);
  const getActiveBranchMessages = useAppStore((s) => s.getActiveBranchMessages);
  const sendMessage = useAppStore((s) => s.sendMessage);
  const updateConversation = useAppStore((s) => s.updateConversation);
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

  const handleSend = useCallback(async (text: string) => {
    // Find the current active leaf to use as parent
    const branchMessages = getActiveBranchMessages();
    const lastMsg = branchMessages[branchMessages.length - 1];
    const parentId = lastMsg?.id ?? null;

    await sendMessage(conversationId, text, parentId, rootNodeId);

    // Auto-title after first exchange
    if (branchMessages.length <= 1) {
      const title = text.length > 50 ? text.slice(0, 47) + '…' : text;
      updateConversation(conversationId, { title });
    }
  }, [conversationId, rootNodeId, sendMessage, getActiveBranchMessages, updateConversation]);

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
              <MessageBubble key={msg.id} message={msg} />
            ))
          )}
        </div>
      </div>
      <div className={styles.inputWrapper}>
        <div className={styles.inputInner}>
          <ChatInput onSend={handleSend} />
        </div>
      </div>
    </div>
  );
}

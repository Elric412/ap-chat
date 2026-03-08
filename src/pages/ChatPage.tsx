import { useEffect, useCallback, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { ChatView } from '../components/chat/ChatView';
import { EmptyState } from '../components/chat/EmptyState';
import { ChatInput } from '../components/chat/ChatInput';
import { useStream } from '../hooks/use-stream';
import { uuidv7 } from '../lib/uuid';
import { putMessage } from '../db/messages-repo';
import type { MessageNode } from '../types/messages';
import { DEFAULT_PARAMETERS } from '../constants/default-parameters';
import styles from '../components/chat/ChatView.module.css';

export function ChatPage(): JSX.Element {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const conversations = useAppStore((s) => s.conversations);
  const createConversation = useAppStore((s) => s.createConversation);
  const setActiveConversation = useAppStore((s) => s.setActiveConversation);
  const updateConversation = useAppStore((s) => s.updateConversation);
  const { sendWithStream, abort, isStreaming: streamHookActive, approveToolCall, denyToolCall } = useStream();
  const [streaming, setStreaming] = useState(false);

  const conversation = conversationId
    ? conversations.find((c) => c.id === conversationId)
    : null;

  /* Sync active conversation with route */
  useEffect(() => {
    if (conversationId) {
      setActiveConversation(conversationId);
    }
  }, [conversationId, setActiveConversation]);

  /** Handle sending a message in an existing conversation */
  const handleSend = useCallback(async (text: string) => {
    if (!conversation) return;
    setStreaming(true);

    const store = useAppStore.getState();
    const branchMessages = store.getActiveBranchMessages();
    const lastMsg = branchMessages[branchMessages.length - 1];
    const parentId = lastMsg?.id ?? null;

    await sendWithStream(conversation.id, text, parentId, conversation.rootNodeId);

    // Auto-title after first exchange
    if (branchMessages.length <= 1) {
      const title = text.length > 50 ? text.slice(0, 47) + '…' : text;
      updateConversation(conversation.id, { title });
    }

    setStreaming(false);
  }, [conversation, sendWithStream, updateConversation]);

  /** Handle first message from empty state — creates a conversation on the fly */
  const handleFirstMessage = useCallback(async (text: string) => {
    const conv = createConversation();
    setStreaming(true);

    // Create the root system node
    const rootNode: MessageNode = {
      id: conv.rootNodeId,
      conversationId: conv.id,
      parentId: null,
      branchId: conv.rootNodeId,
      childIds: [],
      activeChildIndex: 0,
      role: 'system',
      content: [],
      model: null,
      provider: null,
      parameters: DEFAULT_PARAMETERS,
      tokenCounts: { input: 0, output: 0, thinking: 0, cached: 0 },
      costEstimate: { inputCost: 0, outputCost: 0, thinkingCost: 0, cachedDiscount: 0, totalCost: 0 },
      timestamp: Date.now(),
      latency: null,
      status: 'complete',
      toolCalls: [],
      toolResults: [],
      thinkingContent: null,
      attachmentIds: [],
      webSearchResults: [],
      artifactRefs: [],
      comparisonId: null,
      summaryRefs: [],
      metadata: { pinned: false, bookmarked: false },
      _clock: 0,
      _deleted: false,
    };

    await putMessage(rootNode);

    // Navigate to the new conversation
    navigate(`/chat/${conv.id}`, { replace: true });

    // Defer to let navigation/render settle
    setTimeout(async () => {
      const store = useAppStore.getState();
      await store.loadMessages(conv.id);
      await sendWithStream(conv.id, text, conv.rootNodeId, conv.rootNodeId);
      const title = text.length > 50 ? text.slice(0, 47) + '…' : text;
      store.updateConversation(conv.id, { title });
      setStreaming(false);
    }, 50);
  }, [createConversation, navigate, sendWithStream]);

  const handleAbort = useCallback(() => {
    abort();
    setStreaming(false);
  }, [abort]);

  // If we have a valid conversation, render the full chat view
  if (conversation) {
    return <ChatViewWithRoot conversation={conversation} onSend={handleSend} isStreaming={streaming} onAbort={handleAbort} onApproveToolCall={approveToolCall} onDenyToolCall={denyToolCall} />;
  }

  // Empty state with inline input
  return (
    <div className={styles.chatView}>
      <div className={styles.messageList}>
        <div className={styles.messageListInner}>
          <EmptyState />
        </div>
      </div>
      <div className={styles.inputWrapper}>
        <div className={styles.inputInner}>
          <ChatInput onSend={handleFirstMessage} isStreaming={streaming} onAbort={handleAbort} />
        </div>
      </div>
    </div>
  );
}

/** Wrapper that ensures root node exists before rendering ChatView */
function ChatViewWithRoot({
  conversation,
  onSend,
  isStreaming,
  onAbort,
  onApproveToolCall,
  onDenyToolCall,
}: {
  conversation: { id: string; rootNodeId: string };
  onSend: (text: string) => void;
  isStreaming: boolean;
  onAbort: () => void;
  onApproveToolCall: (messageId: string, toolCallId: string) => void;
  onDenyToolCall: (messageId: string, toolCallId: string) => void;
}): JSX.Element {
  const loadMessages = useAppStore((s) => s.loadMessages);

  /* Ensure root node exists */
  useEffect(() => {
    const ensureRoot = async (): Promise<void> => {
      await loadMessages(conversation.id);
      const map = useAppStore.getState().messageMap;
      if (!map.has(conversation.rootNodeId)) {
        const rootNode: MessageNode = {
          id: conversation.rootNodeId,
          conversationId: conversation.id,
          parentId: null,
          branchId: conversation.rootNodeId,
          childIds: [],
          activeChildIndex: 0,
          role: 'system',
          content: [],
          model: null,
          provider: null,
          parameters: DEFAULT_PARAMETERS,
          tokenCounts: { input: 0, output: 0, thinking: 0, cached: 0 },
          costEstimate: { inputCost: 0, outputCost: 0, thinkingCost: 0, cachedDiscount: 0, totalCost: 0 },
          timestamp: Date.now(),
          latency: null,
          status: 'complete',
          toolCalls: [],
          toolResults: [],
          thinkingContent: null,
          attachmentIds: [],
          webSearchResults: [],
          artifactRefs: [],
          comparisonId: null,
          summaryRefs: [],
          metadata: { pinned: false, bookmarked: false },
          _clock: 0,
          _deleted: false,
        };
        await putMessage(rootNode);
        await loadMessages(conversation.id);
      }
    };
    void ensureRoot();
  }, [conversation.id, conversation.rootNodeId, loadMessages]);

  return (
    <ChatView
      conversationId={conversation.id}
      rootNodeId={conversation.rootNodeId}
      onSend={onSend}
      isStreaming={isStreaming}
      onAbort={onAbort}
      onApproveToolCall={onApproveToolCall}
      onDenyToolCall={onDenyToolCall}
    />
  );
}

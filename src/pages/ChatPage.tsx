import { useEffect, useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { ChatView } from '../components/chat/ChatView';
import { EmptyState } from '../components/chat/EmptyState';
import { ChatInput } from '../components/chat/ChatInput';
import { ComparisonView } from '../components/comparison/ComparisonView';
import { ComparisonSetup } from '../components/comparison/ComparisonSetup';
import { useStream } from '../hooks/use-stream';
import { useComparisonStream } from '../hooks/use-comparison-stream';
import { putMessage } from '../db/messages-repo';
import { putAttachments } from '../db/attachments-repo';
import type { MessageNode } from '../types/messages';
import type { ProcessedAttachment } from '../engine/attachment-processor';
import { DEFAULT_PARAMETERS } from '../constants/default-parameters';
import styles from '../components/chat/ChatView.module.css';

function createRootNode(convId: string, rootNodeId: string): MessageNode {
  return {
    id: rootNodeId,
    conversationId: convId,
    parentId: null,
    branchId: rootNodeId,
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
}

export function ChatPage(): JSX.Element {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const conversations = useAppStore((s) => s.conversations);
  const createConversation = useAppStore((s) => s.createConversation);
  const setActiveConversation = useAppStore((s) => s.setActiveConversation);
  const updateConversation = useAppStore((s) => s.updateConversation);
  const comparisonMode = useAppStore((s) => s.comparisonMode);
  const activeComparison = useAppStore((s) => s.activeComparison);
  const comparisonModelIds = useAppStore((s) => s.comparisonModelIds);
  const swarmMode = useAppStore((s) => s.swarmMode);
  const runSwarmInChat = useAppStore((s) => s.runSwarmInChat);
  const abortSwarmRun = useAppStore((s) => s.abortSwarmRun);
  const { sendWithStream, abort, approveToolCall, denyToolCall } = useStream();
  const { startParallelStreams, abortAll } = useComparisonStream();
  const [streaming, setStreaming] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  const conversation = conversationId
    ? conversations.find((c) => c.id === conversationId)
    : null;

  useEffect(() => {
    if (conversationId) setActiveConversation(conversationId);
  }, [conversationId, setActiveConversation]);

  // Show setup modal when comparison mode is activated
  useEffect(() => {
    if (comparisonMode && comparisonModelIds.length < 2 && !activeComparison) {
      setSetupOpen(true);
    }
  }, [comparisonMode, comparisonModelIds.length, activeComparison]);

  const persistAttachments = useCallback(async (attachments?: ProcessedAttachment[]) => {
    if (!attachments?.length) return;
    await putAttachments(attachments.map((pa) => pa.attachment));
  }, []);

  /** Handle sending — routes to comparison or normal stream */
  const handleSend = useCallback(async (text: string, attachments?: ProcessedAttachment[]) => {
    if (!conversation) return;
    setStreaming(true);
    await persistAttachments(attachments);

    if (swarmMode) {
      // Agent Swarm mode — decompose into agents and synthesize one inline reply.
      const store = useAppStore.getState();
      const branchMessages = store.getActiveBranchMessages();
      const lastMsg = branchMessages[branchMessages.length - 1];
      const parentId = lastMsg?.id ?? null;
      await runSwarmInChat(conversation.id, text, parentId, conversation.rootNodeId);
      if (branchMessages.length <= 1) {
        const title = text.length > 50 ? text.slice(0, 47) + '…' : text;
        updateConversation(conversation.id, { title });
      }
    } else if (comparisonMode && comparisonModelIds.length >= 2) {
      // Parallel inference mode
      await startParallelStreams(conversation.id, text);
    } else {
      // Normal single-model mode
      const store = useAppStore.getState();
      const branchMessages = store.getActiveBranchMessages();
      const lastMsg = branchMessages[branchMessages.length - 1];
      const parentId = lastMsg?.id ?? null;
      await sendWithStream(conversation.id, text, parentId, conversation.rootNodeId, attachments);

      if (branchMessages.length <= 1) {
        const title = text.length > 50 ? text.slice(0, 47) + '…' : text;
        updateConversation(conversation.id, { title });
      }
    }
    setStreaming(false);
  }, [conversation, sendWithStream, updateConversation, persistAttachments, comparisonMode, comparisonModelIds, startParallelStreams, swarmMode, runSwarmInChat]);

  const handleFirstMessage = useCallback(async (text: string, attachments?: ProcessedAttachment[]) => {
    const conv = createConversation();
    setStreaming(true);
    await persistAttachments(attachments);
    await putMessage(createRootNode(conv.id, conv.rootNodeId));
    navigate(`/chat/${conv.id}`, { replace: true });

    setTimeout(async () => {
      const store = useAppStore.getState();
      await store.loadMessages(conv.id);

      if (swarmMode) {
        await store.runSwarmInChat(conv.id, text, conv.rootNodeId, conv.rootNodeId);
      } else if (comparisonMode && comparisonModelIds.length >= 2) {
        await startParallelStreams(conv.id, text);
      } else {
        await sendWithStream(conv.id, text, conv.rootNodeId, conv.rootNodeId, attachments);
      }

      const title = text.length > 50 ? text.slice(0, 47) + '…' : text;
      store.updateConversation(conv.id, { title });
      setStreaming(false);
    }, 50);
  }, [createConversation, navigate, sendWithStream, persistAttachments, comparisonMode, comparisonModelIds, startParallelStreams, swarmMode]);

  const handleAbort = useCallback(() => {
    abort();
    abortAll();
    abortSwarmRun();
    setStreaming(false);
  }, [abort, abortAll, abortSwarmRun]);

  const handleComparisonStart = useCallback(() => {
    setSetupOpen(false);
  }, []);

  // Show comparison view if active
  if (activeComparison) {
    return (
      <div className={styles.chatView}>
        <ComparisonView />
        <div className={styles.inputWrapper}>
          <div className={styles.inputInner}>
            <ChatInput
              onSend={conversation ? handleSend : handleFirstMessage}
              disabled={streaming}
              isStreaming={streaming}
              onAbort={handleAbort}
              conversationId={conversationId}
            />
          </div>
        </div>
        <ComparisonSetup open={setupOpen} onClose={() => setSetupOpen(false)} onStart={handleComparisonStart} />
      </div>
    );
  }

  if (conversation) {
    return (
      <>
        <ChatViewWithRoot
          conversation={conversation}
          onSend={handleSend}
          isStreaming={streaming}
          onAbort={handleAbort}
          onApproveToolCall={approveToolCall}
          onDenyToolCall={denyToolCall}
        />
        <ComparisonSetup open={setupOpen} onClose={() => setSetupOpen(false)} onStart={handleComparisonStart} />
      </>
    );
  }

  return (
    <>
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
      <ComparisonSetup open={setupOpen} onClose={() => setSetupOpen(false)} onStart={handleComparisonStart} />
    </>
  );
}

/** Wrapper ensuring root node exists before rendering ChatView */
function ChatViewWithRoot({
  conversation,
  onSend,
  isStreaming,
  onAbort,
  onApproveToolCall,
  onDenyToolCall,
}: {
  conversation: { id: string; rootNodeId: string };
  onSend: (text: string, attachments?: ProcessedAttachment[]) => void;
  isStreaming: boolean;
  onAbort: () => void;
  onApproveToolCall: (messageId: string, toolCallId: string) => void;
  onDenyToolCall: (messageId: string, toolCallId: string) => void;
}): JSX.Element {
  const loadMessages = useAppStore((s) => s.loadMessages);

  useEffect(() => {
    const ensureRoot = async (): Promise<void> => {
      await loadMessages(conversation.id);
      const map = useAppStore.getState().messageMap;
      if (!map.has(conversation.rootNodeId)) {
        await putMessage(createRootNode(conversation.id, conversation.rootNodeId));
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

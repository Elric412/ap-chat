import type { StateCreator } from 'zustand';
import type { MessageNode, ContentPart } from '../types/messages';
import type { InferenceParameters } from '../types/parameters';
import { DEFAULT_PARAMETERS } from '../constants/default-parameters';
import { uuidv7 } from '../lib/uuid';
import { putMessage, putMessages, getMessagesByConversation } from '../db/messages-repo';
import { buildNodeMap, getActiveBranch, getActiveLeaf } from '../engine/branch-utils';

export interface MessagesSlice {
  /** All messages for the active conversation, keyed by id */
  messageMap: Map<string, MessageNode>;
  /** Messages loading state */
  messagesLoading: boolean;

  loadMessages: (conversationId: string) => Promise<void>;
  clearMessages: () => void;
  sendMessage: (
    conversationId: string,
    text: string,
    parentId: string | null,
    rootNodeId: string
  ) => Promise<void>;
  switchBranch: (parentId: string, newIndex: number) => void;
  getActiveBranchMessages: () => MessageNode[];
}

/** Simple mocked assistant response generator */
function generateMockResponse(userText: string): string {
  const responses = [
    `I've analyzed your message regarding "${userText.slice(0, 40)}${userText.length > 40 ? '…' : ''}". Here's my perspective:\n\nThis is a mocked response since no provider adapter is connected yet. In Phase 4, real streaming inference will replace this with actual model output.\n\nThe architecture supports:\n- Multi-provider streaming via SSE\n- Token counting and cost tracking\n- Branch-aware context construction`,

    `Regarding your query:\n\n> ${userText.slice(0, 60)}${userText.length > 60 ? '…' : ''}\n\nThis is a simulated response from the message graph engine. The conversation tree is fully functional — you can fork branches by editing previous messages and navigate between siblings.\n\nEach message node persists to IndexedDB with its complete parameter snapshot for exact reproducibility.`,

    `Thank you for your message. I'm currently operating in mock mode (Phase 3).\n\n**What's working:**\n- Conversation creation and persistence\n- Message tree with branching and navigation\n- IndexedDB storage via the repository layer\n- Branch navigation (◀ 1/n ▶)\n\n**Coming in Phase 4:**\n- Real provider adapters (OpenAI, Anthropic, Google)\n- Streaming token rendering\n- Cost and token tracking`,
  ];

  return responses[Math.floor(Math.random() * responses.length)];
}

function createMessageNode(
  overrides: Partial<MessageNode> & Pick<MessageNode, 'id' | 'conversationId' | 'parentId' | 'role' | 'content'>
): MessageNode {
  return {
    branchId: overrides.id,
    childIds: [],
    activeChildIndex: 0,
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
    ...overrides,
  };
}

export const createMessagesSlice: StateCreator<
  MessagesSlice,
  [['zustand/immer', never]],
  [],
  MessagesSlice
> = (set, get) => ({
  messageMap: new Map(),
  messagesLoading: false,

  loadMessages: async (conversationId) => {
    set((state) => { state.messagesLoading = true; });
    const messages = await getMessagesByConversation(conversationId);
    const map = buildNodeMap(messages);
    set((state) => {
      state.messageMap = map;
      state.messagesLoading = false;
    });
  },

  clearMessages: () => {
    set((state) => { state.messageMap = new Map(); });
  },

  sendMessage: async (conversationId, text, parentId, rootNodeId) => {
    const userNodeId = uuidv7();
    const assistantNodeId = uuidv7();
    const actualParentId = parentId ?? rootNodeId;
    const now = Date.now();

    const userContent: ContentPart[] = [{ type: 'text', text }];
    const userNode = createMessageNode({
      id: userNodeId,
      conversationId,
      parentId: actualParentId,
      role: 'user',
      content: userContent,
      timestamp: now,
    });

    const mockText = generateMockResponse(text);
    const mockLatency = 200 + Math.floor(Math.random() * 800);
    const outputTokens = Math.floor(mockText.length / 4);
    const inputTokens = Math.floor(text.length / 4);

    const assistantContent: ContentPart[] = [{ type: 'text', text: mockText }];
    const assistantNode = createMessageNode({
      id: assistantNodeId,
      conversationId,
      parentId: userNodeId,
      role: 'assistant',
      content: assistantContent,
      model: 'mock-model',
      provider: null,
      timestamp: now + mockLatency,
      latency: mockLatency,
      tokenCounts: { input: inputTokens, output: outputTokens, thinking: 0, cached: 0 },
      costEstimate: {
        inputCost: inputTokens * 0.000003,
        outputCost: outputTokens * 0.000015,
        thinkingCost: 0,
        cachedDiscount: 0,
        totalCost: inputTokens * 0.000003 + outputTokens * 0.000015,
      },
    });

    // Update parent's childIds
    set((state) => {
      const parent = state.messageMap.get(actualParentId);
      if (parent) {
        parent.childIds.push(userNodeId);
        parent.activeChildIndex = parent.childIds.length - 1;
        parent._clock += 1;
      }

      // User node has assistant as child
      userNode.childIds = [assistantNodeId];
      userNode.activeChildIndex = 0;

      state.messageMap.set(userNodeId, userNode);
      state.messageMap.set(assistantNodeId, assistantNode);
      if (parent) state.messageMap.set(actualParentId, parent);
    });

    // Persist all three updated nodes
    const parentNode = get().messageMap.get(actualParentId);
    const nodesToPersist = [userNode, assistantNode];
    if (parentNode) nodesToPersist.push(parentNode);
    await putMessages(nodesToPersist);
  },

  switchBranch: (parentId, newIndex) => {
    set((state) => {
      const parent = state.messageMap.get(parentId);
      if (!parent) return;
      const clamped = Math.max(0, Math.min(newIndex, parent.childIds.length - 1));
      parent.activeChildIndex = clamped;
      parent._clock += 1;
    });
    // Persist
    const updated = get().messageMap.get(parentId);
    if (updated) void putMessage(updated);
  },

  getActiveBranchMessages: () => {
    const map = get().messageMap;
    if (map.size === 0) return [];

    // Find root (node with parentId === null)
    let rootNode: MessageNode | undefined;
    for (const node of map.values()) {
      if (node.parentId === null) {
        rootNode = node;
        break;
      }
    }
    if (!rootNode) return [];

    const leaf = getActiveLeaf(map, rootNode.id);
    if (!leaf) return [];

    return getActiveBranch(map, leaf.id).filter((n) => n.role !== 'system' || n.content.length > 0);
  },
});

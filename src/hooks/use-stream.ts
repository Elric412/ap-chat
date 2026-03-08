/**
 * useStream — Manages streaming inference lifecycle
 * 
 * Handles adapter selection, key retrieval, abort control,
 * and progressive message node updates during streaming.
 */

import { useRef, useCallback } from 'react';
import { useAppStore } from '../store';
import { getAdapter } from '../adapters/registry';
import { getDecryptedKey } from '../vault/vault-manager';
import { resolveParameters } from '../engine/parameter-resolver';
import { calculateCost } from '../engine/cost-calculator';
import { MODEL_REGISTRY } from '../constants/model-registry';
import { uuidv7 } from '../lib/uuid';
import { putMessage, putMessages } from '../db/messages-repo';
import type { MessageNode, ContentPart, TokenCounts, CostEstimate } from '../types/messages';
import type { InferenceParameters } from '../types/parameters';
import type { StreamMessage } from '../adapters/types';
import type { NormalizedStreamEvent, TokenUsage } from '../types/adapters';
import { DEFAULT_PARAMETERS } from '../constants/default-parameters';

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

interface UseStreamReturn {
  sendWithStream: (
    conversationId: string,
    text: string,
    parentId: string | null,
    rootNodeId: string
  ) => Promise<void>;
  abort: () => void;
  isStreaming: boolean;
}

export function useStream(): UseStreamReturn {
  const abortRef = useRef<AbortController | null>(null);
  const streamingRef = useRef(false);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    streamingRef.current = false;
  }, []);

  const sendWithStream = useCallback(async (
    conversationId: string,
    text: string,
    parentId: string | null,
    rootNodeId: string
  ): Promise<void> => {
    const store = useAppStore.getState();
    const selectedModelId = store.selectedModelId;
    const model = MODEL_REGISTRY.find((m) => m.id === selectedModelId);

    if (!model) {
      store.addToast({ id: uuidv7(), type: 'error', message: 'No model selected', duration: 4000 });
      return;
    }

    const adapter = getAdapter(model.providerId);
    if (!adapter) {
      store.addToast({ id: uuidv7(), type: 'error', message: `No adapter for ${model.providerId}`, duration: 4000 });
      return;
    }

    // Get decrypted API key
    const apiKey = await getDecryptedKey(model.providerId);
    if (!apiKey) {
      store.addToast({ id: uuidv7(), type: 'error', message: `No API key for ${model.providerId}. Add one in Settings.`, duration: 5000 });
      return;
    }

    const abortController = new AbortController();
    abortRef.current = abortController;
    streamingRef.current = true;

    const userNodeId = uuidv7();
    const assistantNodeId = uuidv7();
    const actualParentId = parentId ?? rootNodeId;
    const now = Date.now();

    // Create user message node
    const userContent: ContentPart[] = [{ type: 'text', text }];
    const userNode = createMessageNode({
      id: userNodeId,
      conversationId,
      parentId: actualParentId,
      role: 'user',
      content: userContent,
      timestamp: now,
    });

    // Resolve parameters
    const params = resolveParameters(store.inferenceParams, model);

    // Create assistant node (streaming status)
    const assistantNode = createMessageNode({
      id: assistantNodeId,
      conversationId,
      parentId: userNodeId,
      role: 'assistant',
      content: [{ type: 'text', text: '' }],
      model: model.id,
      provider: model.providerId,
      parameters: params,
      status: 'streaming',
      timestamp: now,
    });

    // Wire into message map
    useAppStore.setState((state) => {
      const parent = state.messageMap.get(actualParentId);
      if (parent) {
        parent.childIds.push(userNodeId);
        parent.activeChildIndex = parent.childIds.length - 1;
        parent._clock += 1;
      }
      userNode.childIds = [assistantNodeId];
      userNode.activeChildIndex = 0;
      state.messageMap.set(userNodeId, userNode);
      state.messageMap.set(assistantNodeId, assistantNode);
      if (parent) state.messageMap.set(actualParentId, parent);
    });

    // Build context messages from active branch
    const branchMessages = store.getActiveBranchMessages();
    const contextMessages: StreamMessage[] = branchMessages
      .filter((m) => m.role !== 'system' || m.content.length > 0)
      .map((m) => ({ role: m.role, content: m.content }));

    // Add current user message
    contextMessages.push({ role: 'user', content: userContent });

    let accumulatedText = '';
    let accumulatedThinking = '';
    let tokenUsage: TokenUsage | null = null;

    try {
      const generator = adapter.stream(apiKey, {
        model: model.id,
        messages: contextMessages,
        parameters: params,
        signal: abortController.signal,
      });

      for await (const event of generator) {
        if (abortController.signal.aborted) break;

        switch (event.type) {
          case 'delta_text':
            accumulatedText += event.content ?? '';
            useAppStore.setState((state) => {
              const node = state.messageMap.get(assistantNodeId);
              if (node) {
                node.content = [{ type: 'text', text: accumulatedText }];
                node._clock += 1;
              }
            });
            break;

          case 'delta_thinking':
            accumulatedThinking += event.content ?? '';
            useAppStore.setState((state) => {
              const node = state.messageMap.get(assistantNodeId);
              if (node) {
                node.thinkingContent = accumulatedThinking;
                node._clock += 1;
              }
            });
            break;

          case 'usage':
            if (event.usage) tokenUsage = event.usage;
            break;

          case 'error': {
            const errMsg = event.error?.message ?? 'Stream error';
            useAppStore.setState((state) => {
              const node = state.messageMap.get(assistantNodeId);
              if (node) {
                node.status = 'error';
                node.error = {
                  type: event.error?.type ?? 'unknown',
                  message: errMsg,
                  retryable: event.error?.retryable ?? false,
                  retryAfterMs: event.error?.retryAfterMs,
                };
                node._clock += 1;
              }
            });
            store.addToast({ id: uuidv7(), type: 'error', message: errMsg, duration: 6000 });
            break;
          }
        }
      }
    } catch (err: unknown) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        const errMsg = err instanceof Error ? err.message : 'Network error';
        useAppStore.setState((state) => {
          const node = state.messageMap.get(assistantNodeId);
          if (node) {
            node.status = 'error';
            node.error = { type: 'network', message: errMsg, retryable: true };
            node._clock += 1;
          }
        });
        store.addToast({ id: uuidv7(), type: 'error', message: errMsg, duration: 6000 });
      }
    }

    // Finalize
    const endTime = Date.now();
    const latency = endTime - now;

    const tokenCounts: TokenCounts = tokenUsage
      ? { input: tokenUsage.inputTokens, output: tokenUsage.outputTokens, thinking: tokenUsage.thinkingTokens, cached: tokenUsage.cachedTokens }
      : { input: Math.ceil(text.length / 4), output: Math.ceil(accumulatedText.length / 4), thinking: 0, cached: 0 };

    const costEstimate: CostEstimate = calculateCost(tokenCounts, model.pricing);

    const wasAborted = abortController.signal.aborted;

    useAppStore.setState((state) => {
      const node = state.messageMap.get(assistantNodeId);
      if (node) {
        if (node.status === 'streaming') {
          node.status = wasAborted ? 'aborted' : 'complete';
        }
        node.latency = latency;
        node.tokenCounts = tokenCounts;
        node.costEstimate = costEstimate;
        node._clock += 1;
      }
    });

    // Persist all nodes
    const finalState = useAppStore.getState();
    const parentNode = finalState.messageMap.get(actualParentId);
    const finalUser = finalState.messageMap.get(userNodeId);
    const finalAssistant = finalState.messageMap.get(assistantNodeId);
    const nodesToPersist: MessageNode[] = [];
    if (parentNode) nodesToPersist.push(parentNode);
    if (finalUser) nodesToPersist.push(finalUser);
    if (finalAssistant) nodesToPersist.push(finalAssistant);
    await putMessages(nodesToPersist);

    streamingRef.current = false;
    abortRef.current = null;
  }, []);

  return {
    sendWithStream,
    abort,
    get isStreaming() { return streamingRef.current; },
  };
}

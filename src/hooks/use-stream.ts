/**
 * useStream — Manages streaming inference lifecycle
 * 
 * Handles adapter selection, key retrieval, abort control,
 * and progressive message node updates during streaming.
 * Supports tool calls, citations, and thinking blocks.
 */

import { useRef, useCallback } from 'react';
import type { ProcessedAttachment } from '../engine/attachment-processor';
import { attachmentToContentPart, buildMultimodalContent } from '../engine/attachment-processor';
import { useAppStore } from '../store';
import { getAdapter } from '../adapters/registry';
import { getDecryptedKey } from '../vault/vault-manager';
import { resolveParameters } from '../engine/parameter-resolver';
import { buildContextWindow } from '../engine/context-engine';
import { calculateCost } from '../engine/cost-calculator';
import { detectArtifacts } from '../engine/artifact-detector';
import { MODEL_REGISTRY } from '../constants/model-registry';
import { uuidv7 } from '../lib/uuid';
import { putMessages } from '../db/messages-repo';
import type { MessageNode, ContentPart, TokenCounts, CostEstimate, ToolCall, WebSearchResult } from '../types/messages';
import type { StreamMessage } from '../adapters/types';
import type { TokenUsage } from '../types/adapters';
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

function showToast(type: 'info' | 'success' | 'warning' | 'error', title: string): void {
  useAppStore.getState().addToast({ type, title, dismissible: true, duration: 5000 });
}

interface UseStreamReturn {
  sendWithStream: (
    conversationId: string,
    text: string,
    parentId: string | null,
    rootNodeId: string,
    attachments?: ProcessedAttachment[]
  ) => Promise<void>;
  abort: () => void;
  isStreaming: boolean;
  approveToolCall: (messageId: string, toolCallId: string) => void;
  denyToolCall: (messageId: string, toolCallId: string) => void;
}

export function useStream(): UseStreamReturn {
  const abortRef = useRef<AbortController | null>(null);
  const streamingRef = useRef(false);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    streamingRef.current = false;
  }, []);

  const approveToolCall = useCallback((messageId: string, toolCallId: string) => {
    useAppStore.setState((state) => {
      const node = state.messageMap.get(messageId);
      if (!node) return;
      const tc = node.toolCalls.find((t) => t.id === toolCallId);
      if (tc) {
        tc.status = 'approved';
        node._clock += 1;
      }
    });
  }, []);

  const denyToolCall = useCallback((messageId: string, toolCallId: string) => {
    useAppStore.setState((state) => {
      const node = state.messageMap.get(messageId);
      if (!node) return;
      const tc = node.toolCalls.find((t) => t.id === toolCallId);
      if (tc) {
        tc.status = 'denied';
        node._clock += 1;
      }
    });
  }, []);

  const sendWithStream = useCallback(async (
    conversationId: string,
    text: string,
    parentId: string | null,
    rootNodeId: string,
    attachments?: ProcessedAttachment[]
  ): Promise<void> => {
    const store = useAppStore.getState();
    const selectedModelId = store.selectedModelId;
    const model = MODEL_REGISTRY.find((m) => m.id === selectedModelId);

    if (!model) {
      showToast('error', 'No model selected');
      return;
    }

    const adapter = getAdapter(model.providerId);
    if (!adapter) {
      showToast('error', `No adapter for ${model.providerId}`);
      return;
    }

    const apiKey = await getDecryptedKey(model.providerId);
    if (!apiKey) {
      showToast('error', `No API key for ${model.providerId}. Add one in Settings.`);
      return;
    }

    const abortController = new AbortController();
    abortRef.current = abortController;
    streamingRef.current = true;

    const userNodeId = uuidv7();
    const assistantNodeId = uuidv7();
    const actualParentId = parentId ?? rootNodeId;
    const now = Date.now();

    // Build user content with attachments
    const userContent: ContentPart[] = [{ type: 'text', text }];
    const attachmentIds: string[] = [];
    if (attachments?.length) {
      for (const pa of attachments) {
        userContent.push(attachmentToContentPart(pa));
        attachmentIds.push(pa.attachment.id);
      }
    }

    const userNode = createMessageNode({
      id: userNodeId,
      conversationId,
      parentId: actualParentId,
      role: 'user',
      content: userContent,
      attachmentIds,
      timestamp: now,
    });

    const params = resolveParameters(store.inferenceParams, model);

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

    // Build context using the context engine (sliding window + pinning)
    const branchMessages = store.getActiveBranchMessages();
    const contextConfig = store.contextConfig;
    const systemPrompt = store.getEffectiveSystemPrompt(conversationId);
    const systemPromptTokens = systemPrompt ? Math.ceil(systemPrompt.length / 4) : 0;
    const contextWindow = buildContextWindow(branchMessages, model, contextConfig, systemPromptTokens);

    const contextMessages: StreamMessage[] = [];

    // Inject system prompt if configured
    if (systemPrompt) {
      contextMessages.push({
        role: 'system',
        content: [{ type: 'text', text: systemPrompt }],
      });
    }

    // Inject summary as a system message if present
    if (contextWindow.summary) {
      contextMessages.push({
        role: 'system',
        content: [{ type: 'text', text: contextWindow.summary }],
      });
    }

    // Add windowed messages
    for (const m of contextWindow.messages) {
      if (m.role === 'system' && m.content.length === 0) continue;
      contextMessages.push({ role: m.role, content: m.content });
    }

    // Add current user message
    contextMessages.push({ role: 'user', content: userContent });

    let accumulatedText = '';
    let accumulatedThinking = '';
    let tokenUsage: TokenUsage | null = null;
    const accumulatedToolCalls: ToolCall[] = [];
    const accumulatedCitations: WebSearchResult[] = [];

    try {
      const webSearchEnabled = useAppStore.getState().webSearchEnabled;

      const generator = adapter.stream(apiKey, {
        model: model.id,
        messages: contextMessages,
        parameters: params,
        signal: abortController.signal,
        attachments,
        webSearchEnabled,
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

          case 'tool_call': {
            if (event.toolCall) {
              const tc: ToolCall = {
                id: event.toolCall.id ?? uuidv7(),
                toolName: event.toolCall.toolName ?? 'unknown',
                arguments: event.toolCall.arguments ?? {},
                status: event.toolCall.status ?? 'pending_approval',
              };
              accumulatedToolCalls.push(tc);
              useAppStore.setState((state) => {
                const node = state.messageMap.get(assistantNodeId);
                if (node) {
                  node.toolCalls = [...accumulatedToolCalls];
                  node._clock += 1;
                }
              });
            }
            break;
          }

          case 'citation': {
            if (event.citation) {
              const isDuplicate = accumulatedCitations.some((c) => c.url === event.citation!.url);
              if (!isDuplicate) {
                accumulatedCitations.push({
                  title: event.citation.title,
                  url: event.citation.url,
                  snippet: event.citation.snippet,
                  source: event.citation.source,
                  fetchedAt: event.citation.fetchedAt,
                });
                useAppStore.setState((state) => {
                  const node = state.messageMap.get(assistantNodeId);
                  if (node) {
                    node.webSearchResults = [...accumulatedCitations];
                    node._clock += 1;
                  }
                });
              }
            }
            break;
          }

          case 'usage':
            if (event.usage) tokenUsage = event.usage;
            break;

          case 'error': {
            const errType = event.error?.type ?? 'unknown';
            const mappedType = errType === 'provider_outage' ? 'server' as const : errType;
            const errMsg = event.error?.message ?? 'Stream error';
            useAppStore.setState((state) => {
              const node = state.messageMap.get(assistantNodeId);
              if (node) {
                node.status = 'error';
                node.error = {
                  type: mappedType,
                  message: errMsg,
                  retryable: event.error?.retryable ?? false,
                  retryAfterMs: event.error?.retryAfterMs,
                };
                node._clock += 1;
              }
            });
            showToast('error', errMsg);
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
        showToast('error', errMsg);
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

    // Detect artifacts in final text
    const detected = detectArtifacts(accumulatedText);
    const artifactIds: string[] = [];
    if (detected.length > 0) {
      const store2 = useAppStore.getState();
      for (const d of detected) {
        const artId = store2.addArtifact({
          conversationId,
          messageNodeId: assistantNodeId,
          type: d.type,
          title: d.title,
          language: d.language,
          content: d.content,
        });
        artifactIds.push(artId);
      }
      // Auto-open canvas
      useAppStore.setState((state) => { state.canvasOpen = true; });
    }

    useAppStore.setState((state) => {
      const node = state.messageMap.get(assistantNodeId);
      if (node) {
        if (node.status === 'streaming') {
          node.status = wasAborted ? 'aborted' : 'complete';
        }
        node.latency = latency;
        node.tokenCounts = tokenCounts;
        node.costEstimate = costEstimate;
        node.artifactRefs = artifactIds;
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
    approveToolCall,
    denyToolCall,
    get isStreaming() { return streamingRef.current; },
  };
}

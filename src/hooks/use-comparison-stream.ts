/**
 * useComparisonStream — Fires parallel inference across 2–4 models
 *
 * Each pane streams independently via its own adapter + AbortController.
 * Supports abort-all and per-pane abort.
 */

import { useRef, useCallback } from 'react';
import { useAppStore } from '../store';
import { getAdapter } from '../adapters/registry';
import { getDecryptedKey } from '../vault/vault-manager';
import { resolveParameters } from '../engine/parameter-resolver';
import { buildContextWindow } from '../engine/context-engine';
import { calculateCost } from '../engine/cost-calculator';
import { MODEL_REGISTRY } from '../constants/model-registry';
import type { StreamMessage } from '../adapters/types';
import type { TokenUsage } from '../types/adapters';
import type { ContentPart } from '../types/messages';
import type { ComparisonSession, ComparisonPane } from '../store/comparison-slice';

interface UseComparisonStreamReturn {
  startParallelStreams: (conversationId: string, text: string) => Promise<void>;
  abortAll: () => void;
  isAnyStreaming: boolean;
}

export function useComparisonStream(): UseComparisonStreamReturn {
  const abortsRef = useRef<Map<string, AbortController>>(new Map());
  const streamingCountRef = useRef(0);

  const abortAll = useCallback(() => {
    for (const [, controller] of abortsRef.current) {
      controller.abort();
    }
    abortsRef.current.clear();
    streamingCountRef.current = 0;
  }, []);

  const streamPane = useCallback(async (
    session: ComparisonSession,
    pane: ComparisonPane,
    contextMessages: StreamMessage[],
  ): Promise<void> => {
    const store = useAppStore.getState();
    const model = MODEL_REGISTRY.find((m) => m.id === pane.modelId);
    if (!model) {
      store.updatePane(session.id, pane.id, {
        status: 'error',
        error: `Model ${pane.modelId} not found`,
      });
      return;
    }

    const adapter = getAdapter(model.providerId);
    if (!adapter) {
      store.updatePane(session.id, pane.id, {
        status: 'error',
        error: `No adapter for ${model.providerId}`,
      });
      return;
    }

    const apiKey = await getDecryptedKey(model.providerId);
    if (!apiKey) {
      store.updatePane(session.id, pane.id, {
        status: 'error',
        error: `No API key for ${model.providerId}`,
      });
      return;
    }

    const abortController = new AbortController();
    abortsRef.current.set(pane.id, abortController);

    const params = resolveParameters(store.inferenceParams, model);
    const startTime = Date.now();

    store.updatePane(session.id, pane.id, {
      status: 'streaming',
      startedAt: startTime,
    });

    let accText = '';
    let accThinking = '';
    let tokenUsage: TokenUsage | null = null;

    try {
      const generator = adapter.stream(apiKey, {
        model: model.id,
        messages: contextMessages,
        parameters: params,
        signal: abortController.signal,
        webSearchEnabled: store.webSearchEnabled && model.capabilities.supportsWebSearch,
      });

      for await (const event of generator) {
        if (abortController.signal.aborted) break;

        switch (event.type) {
          case 'delta_text':
            accText += event.content ?? '';
            store.setPaneText(session.id, pane.id, accText);
            break;

          case 'delta_thinking':
            accThinking += event.content ?? '';
            store.updatePane(session.id, pane.id, { thinkingContent: accThinking });
            break;

          case 'usage':
            if (event.usage) tokenUsage = event.usage;
            break;

          case 'error':
            store.updatePane(session.id, pane.id, {
              status: 'error',
              error: event.error?.message ?? 'Stream error',
            });
            return;
        }
      }
    } catch (err: unknown) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        store.updatePane(session.id, pane.id, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Network error',
        });
        return;
      }
    }

    const latencyMs = Date.now() - startTime;
    const wasAborted = abortController.signal.aborted;

    const inputTokens = tokenUsage?.inputTokens ?? Math.ceil(accText.length / 4);
    const outputTokens = tokenUsage?.outputTokens ?? Math.ceil(accText.length / 4);
    const thinkingTokens = tokenUsage?.thinkingTokens ?? 0;

    const costEstimate = calculateCost(
      { input: inputTokens, output: outputTokens, thinking: thinkingTokens, cached: 0 },
      model.pricing,
    );

    store.updatePane(session.id, pane.id, {
      status: wasAborted ? 'aborted' : 'complete',
      latencyMs,
      inputTokens,
      outputTokens,
      thinkingTokens,
      costTotal: costEstimate.totalCost,
    });

    abortsRef.current.delete(pane.id);
  }, []);

  const startParallelStreams = useCallback(async (
    conversationId: string,
    text: string,
  ): Promise<void> => {
    const store = useAppStore.getState();
    const session = store.startComparison(conversationId, text);

    // Build context messages from conversation
    const branchMessages = store.getActiveBranchMessages();
    const primaryModel = MODEL_REGISTRY.find((m) => m.id === session.panes[0]?.modelId);
    if (!primaryModel) return;

    const contextConfig = store.contextConfig;
    const contextWindow = buildContextWindow(branchMessages, primaryModel, contextConfig);

    const contextMessages: StreamMessage[] = [];
    if (contextWindow.summary) {
      contextMessages.push({ role: 'system', content: [{ type: 'text', text: contextWindow.summary }] });
    }
    for (const m of contextWindow.messages) {
      if (m.role === 'system' && m.content.length === 0) continue;
      contextMessages.push({ role: m.role, content: m.content });
    }

    const userContent: ContentPart[] = [{ type: 'text', text }];
    const allMessages: StreamMessage[] = [...contextMessages, { role: 'user', content: userContent }];

    streamingCountRef.current = session.panes.length;

    // Fire all panes in parallel
    await Promise.allSettled(
      session.panes.map((pane) => streamPane(session, pane, allMessages))
    );

    streamingCountRef.current = 0;
  }, [streamPane]);

  return {
    startParallelStreams,
    abortAll,
    get isAnyStreaming() { return streamingCountRef.current > 0; },
  };
}

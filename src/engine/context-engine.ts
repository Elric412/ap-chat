/**
 * Context Engine
 * 
 * Manages sliding-window context construction, message summarization,
 * pinning, and token budget tracking for optimal prompt construction.
 * 
 * Strategies:
 * - sliding_window: Keep most recent N messages within token budget
 * - summarize: Compress older messages into a summary prefix
 * - semantic: (future) Retrieve semantically relevant past messages
 */

import type { MessageNode, ContentPart } from '../types/messages';
import type { ModelEntry } from '../types/models';

/** Rough token estimate: ~4 chars per token for English text */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Extract text from content parts */
function extractText(content: ContentPart[]): string {
  return content
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n');
}

/** Estimate tokens for a single message node */
export function estimateMessageTokens(node: MessageNode): number {
  const textTokens = estimateTokens(extractText(node.content));
  const thinkingTokens = node.thinkingContent ? estimateTokens(node.thinkingContent) : 0;
  const toolCallTokens = node.toolCalls.reduce(
    (sum, tc) => sum + estimateTokens(JSON.stringify(tc.arguments)),
    0
  );
  // Role overhead: ~4 tokens per message for role/formatting
  return textTokens + thinkingTokens + toolCallTokens + 4;
}

export type ContextStrategy = 'sliding_window' | 'summarize' | 'semantic';

export interface ContextConfig {
  strategy: ContextStrategy;
  /** Reserve tokens for system prompt */
  systemReserve: number;
  /** Reserve tokens for model output */
  outputReserve: number;
  /** Maximum summary length in tokens */
  maxSummaryTokens: number;
  /** Enable message pinning (pinned messages always included) */
  enablePinning: boolean;
}

export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
  strategy: 'sliding_window',
  systemReserve: 500,
  outputReserve: 4096,
  maxSummaryTokens: 1024,
  enablePinning: true,
};

export interface ContextWindow {
  /** Messages included in the context (in order) */
  messages: MessageNode[];
  /** Summary of excluded older messages (if summarize strategy) */
  summary: string | null;
  /** Token budget breakdown */
  budget: TokenBudget;
  /** IDs of messages that were excluded */
  excludedIds: string[];
  /** IDs of pinned messages that were force-included */
  pinnedIds: string[];
}

export interface TokenBudget {
  /** Total model context window */
  total: number;
  /** Tokens reserved for system prompt */
  systemReserve: number;
  /** Tokens reserved for output */
  outputReserve: number;
  /** Available tokens for conversation history */
  available: number;
  /** Tokens actually used by included messages */
  used: number;
  /** Tokens used by summary prefix */
  summaryUsed: number;
  /** Remaining tokens */
  remaining: number;
  /** Usage percentage */
  usagePercent: number;
}

/**
 * Build a context window from a branch of messages.
 * 
 * Uses a reverse scan: starts from the most recent messages and
 * works backward, adding messages until the token budget is exhausted.
 * Pinned messages are always included regardless of position.
 */
export function buildContextWindow(
  branchMessages: MessageNode[],
  model: ModelEntry,
  config: ContextConfig = DEFAULT_CONTEXT_CONFIG,
  systemPromptTokens: number = 0
): ContextWindow {
  const totalBudget = model.contextWindow;
  const outputReserve = Math.min(config.outputReserve, model.maxOutputTokens);
  const systemReserve = config.systemReserve + systemPromptTokens;
  const available = totalBudget - systemReserve - outputReserve;

  // Separate pinned and unpinned messages
  const pinnedMessages: MessageNode[] = [];
  const regularMessages: MessageNode[] = [];

  for (const msg of branchMessages) {
    if (config.enablePinning && msg.metadata.pinned) {
      pinnedMessages.push(msg);
    } else {
      regularMessages.push(msg);
    }
  }

  // Calculate pinned token cost
  const pinnedTokens = pinnedMessages.reduce(
    (sum, msg) => sum + estimateMessageTokens(msg),
    0
  );

  // Remaining budget for regular messages
  let remainingBudget = available - pinnedTokens;
  const includedRegular: MessageNode[] = [];
  const excludedIds: string[] = [];

  // Scan from most recent to oldest
  for (let i = regularMessages.length - 1; i >= 0; i--) {
    const msg = regularMessages[i];
    const msgTokens = estimateMessageTokens(msg);

    if (msgTokens <= remainingBudget) {
      includedRegular.unshift(msg);
      remainingBudget -= msgTokens;
    } else {
      // All older messages are excluded
      for (let j = i; j >= 0; j--) {
        excludedIds.push(regularMessages[j].id);
      }
      break;
    }
  }

  // Build summary of excluded messages if using summarize strategy
  let summary: string | null = null;
  let summaryTokens = 0;

  if (config.strategy === 'summarize' && excludedIds.length > 0) {
    const excludedMessages = regularMessages.filter((m) => excludedIds.includes(m.id));
    summary = buildSummary(excludedMessages, config.maxSummaryTokens);
    summaryTokens = estimateTokens(summary);
  }

  // Merge pinned and regular messages in chronological order
  const allIncluded = [...pinnedMessages, ...includedRegular];
  allIncluded.sort((a, b) => a.timestamp - b.timestamp);

  const usedTokens = allIncluded.reduce(
    (sum, msg) => sum + estimateMessageTokens(msg),
    0
  ) + summaryTokens;

  const budget: TokenBudget = {
    total: totalBudget,
    systemReserve,
    outputReserve,
    available,
    used: usedTokens,
    summaryUsed: summaryTokens,
    remaining: available - usedTokens,
    usagePercent: available > 0 ? (usedTokens / available) * 100 : 0,
  };

  return {
    messages: allIncluded,
    summary,
    budget,
    excludedIds,
    pinnedIds: pinnedMessages.map((m) => m.id),
  };
}

/**
 * Build a compressed summary of excluded messages.
 * Client-side heuristic: extract key sentences from each message.
 */
function buildSummary(messages: MessageNode[], maxTokens: number): string {
  const summaryParts: string[] = [];
  const targetChars = maxTokens * 4; // Rough char limit
  let currentChars = 0;

  summaryParts.push('[Earlier conversation summary]');
  currentChars += summaryParts[0].length;

  for (const msg of messages) {
    const text = extractText(msg.content);
    if (!text.trim()) continue;

    const roleLabel = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : msg.role;

    // Take first 200 chars of each message as summary
    const truncated = text.length > 200 ? text.slice(0, 197) + '…' : text;
    const line = `${roleLabel}: ${truncated}`;

    if (currentChars + line.length > targetChars) break;

    summaryParts.push(line);
    currentChars += line.length;
  }

  return summaryParts.join('\n');
}

/**
 * Calculate live token usage for the current conversation state.
 * Used by the TokenBudgetBar component for real-time display.
 */
export function calculateLiveTokenUsage(
  branchMessages: MessageNode[],
  model: ModelEntry,
  config: ContextConfig = DEFAULT_CONTEXT_CONFIG
): TokenBudget {
  const context = buildContextWindow(branchMessages, model, config);
  return context.budget;
}

/**
 * Toggle pin status on a message node.
 * Returns the updated metadata.
 */
export function togglePinned(node: MessageNode): boolean {
  return !node.metadata.pinned;
}

/**
 * Estimate total conversation token usage (all messages, no windowing).
 */
export function estimateConversationTokens(messages: MessageNode[]): number {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
}

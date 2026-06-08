/**
 * Tool Executor
 *
 * Manages tool definitions and dispatch. Includes web search and the
 * sandbox execution layer (Python/JS runners + VFS access).
 */

import type { ToolCall, ToolResult, WebSearchResult } from '../types/messages';
import type { ToolDefinition } from '../types/tools';
import { SANDBOX_TOOL_DEFINITIONS, dispatchSandboxTool, isSandboxTool } from '../sandbox/tools';
import { useAppStore } from '../store';

const WEB_SEARCH_TOOL: ToolDefinition = {
  name: 'web_search',
  description: 'Search the web for current information',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: 'The search query' } },
    required: ['query'],
  },
  requiresApproval: false,
};

/**
 * Tool definitions exposed to the LLM. Sandbox tools are gated by the
 * user's `sandboxEnabled` preference so the prompt stays compact when
 * the feature is off.
 */
export function getToolDefinitions(): ToolDefinition[] {
  const defs: ToolDefinition[] = [WEB_SEARCH_TOOL];
  try {
    if (useAppStore.getState().sandboxEnabled) defs.push(...SANDBOX_TOOL_DEFINITIONS);
  } catch { defs.push(...SANDBOX_TOOL_DEFINITIONS); }
  return defs;
}

export function getToolDefinition(name: string): ToolDefinition | null {
  return getToolDefinitions().find((t) => t.name === name) ?? null;
}

/**
 * Execute a tool call. Sandbox tools require a conversationId — pass it
 * from the streaming pipeline so each call lands in the correct session.
 */
export async function executeTool(
  toolCall: ToolCall,
  conversationId?: string,
): Promise<ToolResult> {
  if (isSandboxTool(toolCall.toolName)) {
    if (!conversationId) {
      return { toolCallId: toolCall.id, output: 'Sandbox tools require an active conversation.', isError: true };
    }
    const result = await dispatchSandboxTool(toolCall, conversationId);
    // Surface the execution to the UI store as well — this is how the
    // Canvas panel knows to render outputs.
    if (toolCall.toolName === 'run_code') {
      const sessionExecutions = useAppStore.getState().getExecutions(conversationId);
      const last = sessionExecutions[sessionExecutions.length - 1];
      if (last) useAppStore.getState().recordExecution(last);
    }
    return result;
  }

  switch (toolCall.toolName) {
    case 'web_search': {
      const query = toolCall.arguments.query as string | undefined;
      if (!query) return { toolCallId: toolCall.id, output: 'Missing query parameter', isError: true };
      return { toolCallId: toolCall.id, output: `Search initiated for: ${query}`, isError: false };
    }
    default:
      return {
        toolCallId: toolCall.id,
        output: `Tool "${toolCall.toolName}" execution not implemented`,
        isError: true,
      };
  }
}

export function normalizeSearchResults(
  raw: Array<Record<string, unknown>>,
): WebSearchResult[] {
  return raw.map((item) => ({
    title: (item.title as string) ?? '',
    url: (item.url as string) ?? (item.uri as string) ?? '',
    snippet: (item.snippet as string) ?? (item.description as string) ?? '',
    source: (item.source as string) ?? (item.displayUrl as string) ?? '',
    fetchedAt: Date.now(),
    selectedPassages: item.passages as string[] | undefined,
  }));
}

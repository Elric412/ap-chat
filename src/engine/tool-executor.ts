/**
 * Tool Executor
 *
 * Manages tool definitions and dispatch. Includes web search and the
 * sandbox execution layer (Python/JS runners + VFS access).
 */

import type { ToolCall, ToolResult, WebSearchResult } from '../types/messages';
import type { ToolDefinition } from '../types/tools';
import { SANDBOX_TOOL_DEFINITIONS, dispatchSandboxTool, isSandboxTool } from '../sandbox/tools';
import { sandboxManager } from '../sandbox/manager';
import type { SandboxLanguage } from '../sandbox/types';
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
    // For run_code, execute directly so we can record the full result into the UI store.
    if (toolCall.toolName === 'run_code') {
      const language = String(toolCall.arguments.language ?? 'python') as SandboxLanguage;
      const code = String(toolCall.arguments.code ?? '');
      const stdin = typeof toolCall.arguments.stdin === 'string' ? (toolCall.arguments.stdin as string) : undefined;
      const result = await sandboxManager.execute({ sessionId: conversationId, language, code, stdin });
      useAppStore.getState().recordExecution(result);
      // Open Canvas so the user can watch outputs in real time.
      useAppStore.setState((s) => { s.canvasOpen = true; });
      return {
        toolCallId: toolCall.id,
        output: {
          status: result.status,
          durationMs: result.durationMs,
          stdout: result.stdout.slice(0, 4000),
          stderr: result.stderr.slice(0, 4000),
          changedFiles: result.changedFiles,
          richOutputs: result.outputs
            .filter((o) => o.kind === 'image' || o.kind === 'table' || o.kind === 'html')
            .map((o) => ({ kind: o.kind })),
          error: result.error,
        },
        isError: result.status !== 'success',
      };
    }
    return dispatchSandboxTool(toolCall, conversationId);
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

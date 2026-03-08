/**
 * Tool Executor
 * 
 * Manages the tool call lifecycle: approval, execution, and result collection.
 * Tool definitions are registered here. For Phase 5, we support a basic
 * web_search tool; additional tools can be registered as needed.
 */

import type { ToolCall, ToolResult, WebSearchResult } from '../types/messages';
import type { ToolDefinition } from '../types/tools';

/** Registry of available tool definitions */
const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'web_search',
    description: 'Search the web for current information',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
      },
      required: ['query'],
    },
    requiresApproval: false,
  },
];

export function getToolDefinitions(): ToolDefinition[] {
  return TOOL_DEFINITIONS;
}

export function getToolDefinition(name: string): ToolDefinition | null {
  return TOOL_DEFINITIONS.find((t) => t.name === name) ?? null;
}

/**
 * Execute a tool call and return the result.
 * Currently a stub — real tool execution will be implemented
 * when provider tool-use flows are fully wired.
 */
export async function executeTool(toolCall: ToolCall): Promise<ToolResult> {
  const definition = getToolDefinition(toolCall.toolName);

  if (!definition) {
    return {
      toolCallId: toolCall.id,
      output: `Unknown tool: ${toolCall.toolName}`,
      isError: true,
    };
  }

  switch (toolCall.toolName) {
    case 'web_search': {
      const query = toolCall.arguments.query as string | undefined;
      if (!query) {
        return { toolCallId: toolCall.id, output: 'Missing query parameter', isError: true };
      }
      // Web search is handled by the search orchestrator
      return {
        toolCallId: toolCall.id,
        output: `Search initiated for: ${query}`,
        isError: false,
      };
    }

    default:
      return {
        toolCallId: toolCall.id,
        output: `Tool "${toolCall.toolName}" execution not implemented`,
        isError: true,
      };
  }
}

/**
 * Convert provider-specific grounding/search results into
 * normalized WebSearchResult objects.
 */
export function normalizeSearchResults(
  raw: Array<Record<string, unknown>>
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

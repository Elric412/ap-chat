/**
 * LLM-Callable Sandbox Tools
 *
 * These are the tool definitions exposed to the model. They map onto
 * `sandboxManager` operations and are dispatched from `tool-executor`.
 */

import type { ToolDefinition } from '../types/tools';
import type { ToolCall, ToolResult } from '../types/messages';
import { sandboxManager } from './manager';
import type { SandboxExecutionResult, SandboxLanguage } from './types';

export const SANDBOX_TOOL_NAMES = [
  'run_code',
  'read_file',
  'write_file',
  'list_files',
  'reset_sandbox',
] as const;

export type SandboxToolName = typeof SANDBOX_TOOL_NAMES[number];

export const SANDBOX_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'run_code',
    description:
      'Execute code inside the user\'s isolated per-chat sandbox. Supports Python (Pyodide, with numpy/pandas/matplotlib available via micropip) and JavaScript. ' +
      'Returns stdout, stderr, structured outputs (images, tables, html) and the list of files written. Use this for data analysis, plots, computation, file transforms.',
    parameters: {
      type: 'object',
      properties: {
        language: { type: 'string', enum: ['python', 'javascript', 'typescript'], description: 'Execution language.' },
        code: { type: 'string', description: 'Source code to execute. The sandbox CWD is /sandbox; files written here persist across calls in the same chat.' },
        stdin: { type: 'string', description: 'Optional stdin payload (python only).' },
      },
      required: ['language', 'code'],
    },
    requiresApproval: false,
  },
  {
    name: 'read_file',
    description: 'Read a UTF-8 file from the sandbox virtual filesystem.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'File path, relative to /sandbox.' } },
      required: ['path'],
    },
    requiresApproval: false,
  },
  {
    name: 'write_file',
    description: 'Create or overwrite a UTF-8 file in the sandbox virtual filesystem.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
        mimeType: { type: 'string', description: 'Optional MIME type.' },
      },
      required: ['path', 'content'],
    },
    requiresApproval: false,
  },
  {
    name: 'list_files',
    description: 'List all files currently present in the sandbox virtual filesystem.',
    parameters: { type: 'object', properties: {} },
    requiresApproval: false,
  },
  {
    name: 'reset_sandbox',
    description: 'Tear down the current sandbox session, killing the worker and wiping the virtual filesystem. Use sparingly.',
    parameters: { type: 'object', properties: {} },
    requiresApproval: true,
  },
];

export function isSandboxTool(name: string): name is SandboxToolName {
  return (SANDBOX_TOOL_NAMES as readonly string[]).includes(name);
}

/**
 * Dispatch a sandbox tool call. `conversationId` is required because
 * each conversation maps 1:1 to a sandbox session.
 */
export async function dispatchSandboxTool(
  call: ToolCall,
  conversationId: string,
): Promise<ToolResult> {
  try {
    switch (call.toolName) {
      case 'run_code': {
        const language = String(call.arguments.language ?? 'python') as SandboxLanguage;
        const code = String(call.arguments.code ?? '');
        const stdin = typeof call.arguments.stdin === 'string' ? (call.arguments.stdin as string) : undefined;
        const result: SandboxExecutionResult = await sandboxManager.execute({
          sessionId: conversationId,
          language,
          code,
          stdin,
        });
        return {
          toolCallId: call.id,
          output: summarizeExecution(result),
          isError: result.status !== 'success',
        };
      }
      case 'read_file': {
        const path = String(call.arguments.path ?? '');
        const text = sandboxManager.readFile(conversationId, path);
        return {
          toolCallId: call.id,
          output: text === null ? { error: `File not found: ${path}` } : { path, content: text },
          isError: text === null,
        };
      }
      case 'write_file': {
        const path = String(call.arguments.path ?? '');
        const content = String(call.arguments.content ?? '');
        const mimeType = typeof call.arguments.mimeType === 'string' ? (call.arguments.mimeType as string) : 'text/plain';
        const f = sandboxManager.writeFile(conversationId, path, content, mimeType);
        return { toolCallId: call.id, output: { path: f.path, bytes: f.bytes }, isError: false };
      }
      case 'list_files': {
        const files = sandboxManager.listFiles(conversationId)
          .map((f) => ({ path: f.path, bytes: f.bytes, mimeType: f.mimeType, updatedAt: f.updatedAt }));
        return { toolCallId: call.id, output: { files }, isError: false };
      }
      case 'reset_sandbox': {
        sandboxManager.reset(conversationId);
        return { toolCallId: call.id, output: { ok: true }, isError: false };
      }
      default:
        return { toolCallId: call.id, output: `Unknown sandbox tool: ${call.toolName}`, isError: true };
    }
  } catch (err) {
    return {
      toolCallId: call.id,
      output: err instanceof Error ? err.message : String(err),
      isError: true,
    };
  }
}

/** Compact, model-friendly summary of an execution. */
function summarizeExecution(r: SandboxExecutionResult): Record<string, unknown> {
  const truncate = (s: string, n = 4000) => (s.length > n ? s.slice(0, n) + `\n…[truncated ${s.length - n} chars]` : s);
  const rich = r.outputs
    .filter((o) => o.kind === 'image' || o.kind === 'table' || o.kind === 'html')
    .map((o) => ({ kind: o.kind, ...(o.kind === 'table' ? { rows: Array.isArray(o.data) ? o.data.length : 0 } : {}) }));
  return {
    status: r.status,
    durationMs: r.durationMs,
    stdout: truncate(r.stdout),
    stderr: truncate(r.stderr),
    richOutputs: rich,
    changedFiles: r.changedFiles,
    error: r.error,
  };
}

/**
 * Sandbox Execution Layer — Types
 *
 * Per-session isolated code execution. The sandbox is a thin orchestration
 * layer on top of Web Workers (Pyodide for Python, native JS Worker for
 * JS/TS). Each conversation gets its own session with an isolated virtual
 * filesystem, output history, and resource limits.
 */

export type SandboxLanguage = 'python' | 'javascript' | 'typescript' | 'shell';

export type SandboxOutputKind =
  | 'stdout'
  | 'stderr'
  | 'log'
  | 'result'   // serialized return value
  | 'image'    // base64 data url (plots)
  | 'html'     // rendered html fragment
  | 'table'    // JSON array of records
  | 'file'     // file artifact reference
  | 'error';

export interface SandboxOutputChunk {
  id: string;
  kind: SandboxOutputKind;
  /** Plain text payload (utf-8) for text-like kinds. */
  text?: string;
  /** Data url or base64 for binary kinds. */
  dataUrl?: string;
  /** Structured payload — used for table/result. */
  data?: unknown;
  /** File metadata for kind='file'. */
  file?: { path: string; mimeType: string; bytes: number };
  timestamp: number;
}

export interface SandboxFile {
  path: string;
  /** Base64-encoded contents — keeps the VFS serializable. */
  contentB64: string;
  mimeType: string;
  bytes: number;
  updatedAt: number;
}

export interface SandboxLimits {
  /** Per-execution wall-clock timeout (ms). */
  timeoutMs: number;
  /** Maximum captured output bytes per execution. */
  maxOutputBytes: number;
  /** Maximum total VFS bytes per session. */
  maxDiskBytes: number;
  /** Soft heap cap reported to the runtime when supported (MB). */
  heapMb: number;
  /** Whether network egress is permitted from inside the sandbox. */
  networkAllowed: boolean;
}

export interface SandboxExecutionRequest {
  sessionId: string;
  language: SandboxLanguage;
  code: string;
  /** Optional stdin payload (string) — Python only for now. */
  stdin?: string;
  /** Override per-execution limits. */
  limits?: Partial<SandboxLimits>;
}

export interface SandboxExecutionResult {
  executionId: string;
  sessionId: string;
  language: SandboxLanguage;
  code: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  status: 'success' | 'error' | 'timeout' | 'aborted';
  outputs: SandboxOutputChunk[];
  stdout: string;
  stderr: string;
  /** Files created or modified by this execution. */
  changedFiles: string[];
  /** Truncated error message, when status != 'success'. */
  error?: string;
}

export interface SandboxSession {
  sessionId: string;
  conversationId: string;
  createdAt: number;
  lastUsedAt: number;
  /** Total VFS bytes currently consumed. */
  diskUsed: number;
  /** Cumulative execution count, for telemetry. */
  executionCount: number;
}

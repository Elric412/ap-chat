/**
 * Sandbox Manager
 *
 * Owns per-conversation sandbox sessions. Each session keeps an
 * isolated virtual filesystem and a pinned Python worker (Pyodide
 * boot is expensive — ~3s — so we keep it warm). JavaScript executions
 * use a fresh worker per call to guarantee isolation.
 *
 * Resource enforcement:
 *   - timeout: terminate worker, emit timeout result
 *   - output cap: enforced inside worker, truncates further pushes
 *   - disk cap: enforced when copying VFS back into the session
 *   - network: workers strip fetch/XHR/WS unless explicitly allowed
 */

import { uuidv7 } from '../lib/uuid';
import { DEFAULT_SANDBOX_LIMITS, mergeLimits } from './limits';
import { PYTHON_WORKER_SOURCE } from './python-worker-source';
import { JS_WORKER_SOURCE } from './js-worker-source';
import type {
  SandboxExecutionRequest,
  SandboxExecutionResult,
  SandboxFile,
  SandboxLimits,
  SandboxOutputChunk,
  SandboxSession,
} from './types';

interface InternalSession {
  meta: SandboxSession;
  files: Map<string, SandboxFile>;
  pyWorker: Worker | null;
  pyWorkerUrl: string | null;
}

const sessions = new Map<string, InternalSession>();
const listeners = new Set<(sessionId: string) => void>();

function blobUrl(source: string): string {
  const blob = new Blob([source], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
}

function notify(sessionId: string): void {
  for (const l of listeners) l(sessionId);
}

function ensureSession(conversationId: string): InternalSession {
  const sessionId = conversationId;
  const existing = sessions.get(sessionId);
  if (existing) return existing;
  const meta: SandboxSession = {
    sessionId,
    conversationId,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    diskUsed: 0,
    executionCount: 0,
  };
  const session: InternalSession = { meta, files: new Map(), pyWorker: null, pyWorkerUrl: null };
  sessions.set(sessionId, session);
  return session;
}

function ensurePyWorker(session: InternalSession): Worker {
  if (session.pyWorker) return session.pyWorker;
  const url = blobUrl(PYTHON_WORKER_SOURCE);
  const w = new Worker(url);
  session.pyWorker = w;
  session.pyWorkerUrl = url;
  return w;
}

function disposePyWorker(session: InternalSession): void {
  if (session.pyWorker) { try { session.pyWorker.terminate(); } catch { /* noop */ } }
  if (session.pyWorkerUrl) { try { URL.revokeObjectURL(session.pyWorkerUrl); } catch { /* noop */ } }
  session.pyWorker = null;
  session.pyWorkerUrl = null;
}

function filesArray(session: InternalSession): SandboxFile[] {
  return Array.from(session.files.values());
}

interface WorkerResponse {
  id: string;
  ok: boolean;
  stdout: string;
  stderr: string;
  outputs: Array<Omit<SandboxOutputChunk, 'id' | 'timestamp'>>;
  files?: SandboxFile[];
  changedFiles?: string[];
  error?: string;
}

function runWithWorker(
  worker: Worker,
  payload: Record<string, unknown>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<WorkerResponse | { timedOut: true }> {
  return new Promise((resolve) => {
    const id = uuidv7();
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      onTimeout();
      resolve({ timedOut: true });
    }, timeoutMs);

    const handler = (ev: MessageEvent<WorkerResponse>) => {
      if (ev.data?.id !== id) return;
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.removeEventListener('message', handler);
      resolve(ev.data);
    };
    worker.addEventListener('message', handler);
    worker.postMessage({ ...payload, id });
  });
}

function decorateOutputs(raw: WorkerResponse['outputs']): SandboxOutputChunk[] {
  return (raw || []).map((o) => ({ id: uuidv7(), timestamp: Date.now(), ...o }));
}

function applyVfsBack(session: InternalSession, files: SandboxFile[] | undefined, limits: SandboxLimits): void {
  if (!files) return;
  let total = 0;
  for (const f of files) total += f.bytes;
  if (total > limits.maxDiskBytes) {
    // Reject the write entirely — better than silent partial state.
    throw new Error(`Sandbox disk quota exceeded (${total} > ${limits.maxDiskBytes} bytes)`);
  }
  session.files.clear();
  for (const f of files) session.files.set(f.path, f);
  session.meta.diskUsed = total;
}

export const sandboxManager = {
  subscribe(cb: (sessionId: string) => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },

  getSession(conversationId: string): SandboxSession | null {
    return sessions.get(conversationId)?.meta ?? null;
  },

  listFiles(conversationId: string): SandboxFile[] {
    const s = sessions.get(conversationId);
    return s ? filesArray(s) : [];
  },

  reset(conversationId: string): void {
    const s = sessions.get(conversationId);
    if (!s) return;
    disposePyWorker(s);
    sessions.delete(conversationId);
    notify(conversationId);
  },

  writeFile(conversationId: string, path: string, text: string, mimeType = 'text/plain'): SandboxFile {
    const s = ensureSession(conversationId);
    const bytes = new TextEncoder().encode(text);
    const file: SandboxFile = {
      path,
      contentB64: btoa(String.fromCharCode(...bytes)),
      bytes: bytes.length,
      mimeType,
      updatedAt: Date.now(),
    };
    s.files.set(path, file);
    s.meta.diskUsed = filesArray(s).reduce((a, f) => a + f.bytes, 0);
    notify(conversationId);
    return file;
  },

  readFile(conversationId: string, path: string): string | null {
    const s = sessions.get(conversationId);
    const f = s?.files.get(path);
    if (!f) return null;
    try {
      const bin = Uint8Array.from(atob(f.contentB64), c => c.charCodeAt(0));
      return new TextDecoder().decode(bin);
    } catch { return null; }
  },

  /** Run a POSIX-ish shell command (ls, cat, mkdir, mv, cp, rm, grep, find, …). */
  async runShell(conversationId: string, command: string): Promise<SandboxExecutionResult> {
    return this.execute({
      sessionId: conversationId,
      language: 'python',
      code: '',
      stdin: undefined,
      // @ts-expect-error — internal action marker, manager forwards to worker
      action: 'shell',
      command,
    } as SandboxExecutionRequest & { action: 'shell'; command: string });
  },

  /** Install Python packages via micropip (best-effort, pure-python wheels). */
  async installPackages(conversationId: string, packages: string[]): Promise<SandboxExecutionResult> {
    return this.execute({
      sessionId: conversationId,
      language: 'python',
      code: '',
      // @ts-expect-error — internal action marker
      action: 'install',
      packages,
    } as SandboxExecutionRequest & { action: 'install'; packages: string[] });
  },

  async execute(req: SandboxExecutionRequest): Promise<SandboxExecutionResult> {
    const session = ensureSession(req.sessionId);
    const limits = mergeLimits(DEFAULT_SANDBOX_LIMITS, req.limits);
    const executionId = uuidv7();
    const startedAt = Date.now();
    session.meta.lastUsedAt = startedAt;
    session.meta.executionCount += 1;

    let response: WorkerResponse | { timedOut: true };
    const action = (req as unknown as { action?: string }).action;

    if (req.language === 'python' || action === 'shell' || action === 'install') {
      const worker = ensurePyWorker(session);
      response = await runWithWorker(
        worker,
        {
          action,
          code: req.code,
          stdin: req.stdin,
          command: (req as unknown as { command?: string }).command,
          packages: (req as unknown as { packages?: string[] }).packages,
          files: filesArray(session),
          limits,
        },
        limits.timeoutMs,
        () => disposePyWorker(session),
      );
    } else if (req.language === 'javascript' || req.language === 'typescript') {
      const url = blobUrl(JS_WORKER_SOURCE);
      const worker = new Worker(url);
      try {
        response = await runWithWorker(
          worker,
          {
            code: req.code,
            files: filesArray(session),
            limits,
            networkAllowed: limits.networkAllowed,
          },
          limits.timeoutMs,
          () => { try { worker.terminate(); } catch { /* noop */ } },
        );
      } finally {
        try { worker.terminate(); } catch { /* noop */ }
        try { URL.revokeObjectURL(url); } catch { /* noop */ }
      }
    } else {
      return {
        executionId, sessionId: req.sessionId, language: req.language, code: req.code,
        startedAt, endedAt: Date.now(), durationMs: 0,
        status: 'error', outputs: [], stdout: '', stderr: '',
        changedFiles: [], error: `Language "${req.language}" is not supported in this sandbox.`,
      };
    }

    const endedAt = Date.now();
    if ('timedOut' in response) {
      notify(req.sessionId);
      return {
        executionId, sessionId: req.sessionId, language: req.language, code: req.code,
        startedAt, endedAt, durationMs: endedAt - startedAt,
        status: 'timeout', outputs: [], stdout: '', stderr: '',
        changedFiles: [],
        error: `Execution exceeded ${limits.timeoutMs}ms wall-clock limit and was terminated.`,
      };
    }

    try {
      applyVfsBack(session, response.files, limits);
    } catch (err) {
      response.ok = false;
      response.error = err instanceof Error ? err.message : String(err);
    }

    notify(req.sessionId);
    return {
      executionId, sessionId: req.sessionId, language: req.language, code: req.code,
      startedAt, endedAt, durationMs: endedAt - startedAt,
      status: response.ok ? 'success' : 'error',
      outputs: decorateOutputs(response.outputs),
      stdout: response.stdout ?? '',
      stderr: response.stderr ?? '',
      changedFiles: response.changedFiles ?? [],
      error: response.error,
    };
  },
};

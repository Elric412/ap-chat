/**
 * JavaScript Worker Source
 *
 * Lightweight in-worker JS evaluator. Provides:
 *   - console.{log,error,warn,info} capture
 *   - display.image / display.table / display.html helpers
 *   - in-memory VFS via globalThis.files (read/write)
 *   - network disabled by default (we delete `fetch` etc unless allowed)
 *
 * The worker is a fresh Worker per execution to maintain isolation.
 */

export const JS_WORKER_SOURCE = String.raw`
const richOutputs = [];
const stdoutBuf = [];
const stderrBuf = [];
let outputBytes = 0;
let outputCap = 2 * 1024 * 1024;

function pushOut(kind, payload) {
  const size = (payload.text ? payload.text.length : 0) + (payload.dataUrl ? payload.dataUrl.length : 0);
  outputBytes += size;
  if (outputBytes > outputCap) return;
  richOutputs.push({ kind, ...payload });
}

function fmt(args) {
  return args.map(a => {
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a, null, 2); } catch (_e) { return String(a); }
  }).join(' ');
}

const console_ = {
  log:  (...a) => { const t = fmt(a); stdoutBuf.push(t); pushOut('stdout', { text: t + '\n' }); },
  info: (...a) => { const t = fmt(a); stdoutBuf.push(t); pushOut('stdout', { text: t + '\n' }); },
  warn: (...a) => { const t = fmt(a); stderrBuf.push(t); pushOut('stderr', { text: t + '\n' }); },
  error:(...a) => { const t = fmt(a); stderrBuf.push(t); pushOut('stderr', { text: t + '\n' }); },
};

const display = {
  image: (dataUrl) => pushOut('image', { dataUrl }),
  table: (records) => pushOut('table', { data: records }),
  html:  (text) => pushOut('html', { text }),
};

self.onmessage = async (ev) => {
  const { id, code, files, limits, networkAllowed } = ev.data;
  outputCap = (limits && limits.maxOutputBytes) || outputCap;

  if (!networkAllowed) {
    try { self.fetch = undefined; } catch (_e) {}
    try { self.XMLHttpRequest = undefined; } catch (_e) {}
    try { self.WebSocket = undefined; } catch (_e) {}
  }

  // Build an in-memory FS map from inputs
  const vfs = new Map();
  for (const f of (files || [])) {
    vfs.set(f.path, {
      path: f.path,
      contentB64: f.contentB64,
      bytes: f.bytes,
      mimeType: f.mimeType,
      updatedAt: Date.now(),
    });
  }
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  function b64ToBytes(b64) { return Uint8Array.from(atob(b64), c => c.charCodeAt(0)); }
  function bytesToB64(bytes) {
    let s = ''; const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    return btoa(s);
  }
  const fs = {
    read(path)  { const f = vfs.get(path); return f ? decoder.decode(b64ToBytes(f.contentB64)) : null; },
    write(path, text) {
      const bytes = encoder.encode(String(text));
      vfs.set(path, { path, contentB64: bytesToB64(bytes), bytes: bytes.length, mimeType: 'text/plain', updatedAt: Date.now() });
    },
    list() { return Array.from(vfs.keys()); },
  };

  const beforeKeys = new Set(Array.from(vfs.entries()).map(([k,v]) => k + ':' + v.bytes));

  try {
    const userFn = new Function('console', 'display', 'fs', '"use strict";\nreturn (async () => {\n' + code + '\n})();');
    const r = await userFn(console_, display, fs);
    if (r !== undefined) {
      let repr;
      try { repr = typeof r === 'string' ? r : JSON.stringify(r, null, 2); } catch (_e) { repr = String(r); }
      pushOut('result', { text: repr });
    }
    const all = Array.from(vfs.values());
    const changed = all.filter(f => !beforeKeys.has(f.path + ':' + f.bytes)).map(f => f.path);
    postMessage({
      id, ok: true,
      stdout: stdoutBuf.join('\n'),
      stderr: stderrBuf.join('\n'),
      outputs: richOutputs,
      files: all,
      changedFiles: changed,
    });
  } catch (err) {
    postMessage({
      id, ok: false,
      stdout: stdoutBuf.join('\n'),
      stderr: stderrBuf.join('\n'),
      outputs: richOutputs,
      error: (err && err.message) ? err.message : String(err),
    });
  }
};
`;

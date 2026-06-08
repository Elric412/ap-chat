/**
 * Pyodide Worker Source
 *
 * Loaded as a Blob URL — never bundled. The worker boots Pyodide
 * from the CDN on first execution, captures stdout/stderr, exposes
 * a tiny VFS bridge (`/sandbox` mount) and a `display()` helper for
 * images/tables, then reports results back over postMessage.
 */

export const PYTHON_WORKER_SOURCE = String.raw`
const PYODIDE_VERSION = '0.26.4';
const PYODIDE_BASE = 'https://cdn.jsdelivr.net/pyodide/v' + PYODIDE_VERSION + '/full/';

let pyodideReady = null;
const outBuf = [];
const errBuf = [];
const richOutputs = [];
let outputBytes = 0;
let outputCap = 2 * 1024 * 1024;

function pushOut(kind, payload) {
  const size = (payload.text ? payload.text.length : 0) + (payload.dataUrl ? payload.dataUrl.length : 0);
  outputBytes += size;
  if (outputBytes > outputCap) {
    if (!richOutputs.some(o => o.kind === 'error' && o.text === '__truncated__')) {
      richOutputs.push({ kind: 'error', text: '__truncated__' });
    }
    return;
  }
  richOutputs.push({ kind, ...payload });
}

async function loadPyodideOnce() {
  if (pyodideReady) return pyodideReady;
  importScripts(PYODIDE_BASE + 'pyodide.js');
  pyodideReady = self.loadPyodide({ indexURL: PYODIDE_BASE }).then(async (py) => {
    py.setStdout({ batched: (s) => { outBuf.push(s); pushOut('stdout', { text: s + '\n' }); } });
    py.setStderr({ batched: (s) => { errBuf.push(s); pushOut('stderr', { text: s + '\n' }); } });
    // Install helpers + matplotlib agg backend
    await py.runPythonAsync(\`
import sys, os, json, base64, io
os.makedirs('/sandbox', exist_ok=True)
os.chdir('/sandbox')

class _Display:
    @staticmethod
    def image(b64, mime='image/png'):
        from js import __sbx_emit
        __sbx_emit('image', json.dumps({'dataUrl': 'data:' + mime + ';base64,' + b64}))
    @staticmethod
    def table(records):
        from js import __sbx_emit
        __sbx_emit('table', json.dumps({'data': records}))
    @staticmethod
    def html(s):
        from js import __sbx_emit
        __sbx_emit('html', json.dumps({'text': str(s)}))

display = _Display()

def _maybe_capture_pyplot():
    try:
        import matplotlib
        matplotlib.use('AGG')
        import matplotlib.pyplot as plt
        if plt.get_fignums():
            for num in plt.get_fignums():
                fig = plt.figure(num)
                buf = io.BytesIO()
                fig.savefig(buf, format='png', bbox_inches='tight')
                display.image(base64.b64encode(buf.getvalue()).decode())
                plt.close(fig)
    except Exception:
        pass
\`);
    return py;
  });
  return pyodideReady;
}

function emitFromPython(kind, jsonPayload) {
  try {
    const parsed = JSON.parse(jsonPayload);
    pushOut(kind, parsed);
  } catch (_e) { /* noop */ }
}
self.__sbx_emit = emitFromPython;

async function syncVfsIn(py, files) {
  const FS = py.FS;
  for (const f of files) {
    const path = '/sandbox/' + f.path.replace(/^\/+/, '');
    const dir = path.substring(0, path.lastIndexOf('/'));
    if (dir && dir !== '/sandbox') {
      try { FS.mkdirTree(dir); } catch (_e) {}
    }
    const bin = Uint8Array.from(atob(f.contentB64), c => c.charCodeAt(0));
    FS.writeFile(path, bin);
  }
}

function syncVfsOut(py, beforePaths) {
  const FS = py.FS;
  const after = [];
  function walk(dir) {
    let entries;
    try { entries = FS.readdir(dir); } catch (_e) { return; }
    for (const name of entries) {
      if (name === '.' || name === '..') continue;
      const full = dir + '/' + name;
      let stat;
      try { stat = FS.stat(full); } catch (_e) { continue; }
      if (FS.isDir(stat.mode)) walk(full);
      else {
        const rel = full.replace(/^\/sandbox\//, '');
        let bin;
        try { bin = FS.readFile(full); } catch (_e) { continue; }
        let b64 = '';
        const CHUNK = 0x8000;
        for (let i = 0; i < bin.length; i += CHUNK) {
          b64 += String.fromCharCode.apply(null, bin.subarray(i, i + CHUNK));
        }
        after.push({
          path: rel,
          contentB64: btoa(b64),
          bytes: bin.length,
          mimeType: guessMime(rel),
          updatedAt: Date.now(),
        });
      }
    }
  }
  walk('/sandbox');
  const beforeKey = new Set(beforePaths);
  const changed = after.filter(f => !beforeKey.has(f.path + ':' + f.bytes));
  return { all: after, changed: changed.map(c => c.path) };
}

function guessMime(p) {
  const ext = p.split('.').pop().toLowerCase();
  return {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    svg: 'image/svg+xml', csv: 'text/csv', json: 'application/json',
    txt: 'text/plain', md: 'text/markdown', html: 'text/html',
  }[ext] || 'application/octet-stream';
}

self.onmessage = async (ev) => {
  const { id, code, files, limits, stdin } = ev.data;
  outBuf.length = 0; errBuf.length = 0; richOutputs.length = 0; outputBytes = 0;
  outputCap = (limits && limits.maxOutputBytes) || outputCap;

  try {
    const py = await loadPyodideOnce();
    await syncVfsIn(py, files || []);
    const beforeSnap = (() => {
      try {
        const fs = py.FS; const acc = [];
        (function walk(d){ for (const n of fs.readdir(d)) {
          if (n === '.' || n === '..') continue;
          const p = d + '/' + n; const s = fs.stat(p);
          if (fs.isDir(s.mode)) walk(p); else acc.push(p.replace(/^\/sandbox\//,'') + ':' + s.size);
        }})('/sandbox');
        return acc;
      } catch (_e) { return []; }
    })();

    if (stdin) py.setStdin({ stdin: () => stdin });
    let resultRepr = null;
    try {
      const r = await py.runPythonAsync(code);
      if (r !== undefined && r !== null) {
        try { resultRepr = r.toString(); } catch (_e) { resultRepr = '<unrepr>'; }
      }
    } finally {
      try { await py.runPythonAsync('_maybe_capture_pyplot()'); } catch (_e) {}
    }

    if (resultRepr !== null && resultRepr !== 'None' && resultRepr !== '') {
      pushOut('result', { text: resultRepr });
    }

    const vfs = syncVfsOut(py, beforeSnap);
    postMessage({
      id, ok: true,
      stdout: outBuf.join('\n'),
      stderr: errBuf.join('\n'),
      outputs: richOutputs,
      files: vfs.all,
      changedFiles: vfs.changed,
    });
  } catch (err) {
    postMessage({
      id, ok: false,
      stdout: outBuf.join('\n'),
      stderr: errBuf.join('\n'),
      outputs: richOutputs,
      error: (err && err.message) ? err.message : String(err),
    });
  }
};
`;

/**
 * Sandbox → Artifact promotion
 *
 * The whole point of the sandbox is to let the model *build* something the
 * user can actually see. When an execution writes files to the VFS, those
 * files must surface in the Canvas as previewable / copyable / downloadable
 * artifacts — otherwise the user is left with a useless "/sandbox/...path"
 * reference and no actual output.
 *
 * This module classifies VFS files into artifact types and pushes the
 * preview-worthy ones into the artifact store, deduped by path.
 */

import type { ArtifactType } from '../types/artifacts';
import { sandboxManager } from './manager';
import { useAppStore } from '../store';

/** Extensions that are worth surfacing as a viewable artifact. */
const EXT_TYPE: Record<string, { type: ArtifactType; language?: string }> = {
  html: { type: 'html', language: 'html' },
  htm: { type: 'html', language: 'html' },
  svg: { type: 'svg' },
  md: { type: 'markdown', language: 'markdown' },
  markdown: { type: 'markdown', language: 'markdown' },
  // Code-ish — rendered as code with copy/download.
  js: { type: 'code', language: 'javascript' },
  mjs: { type: 'code', language: 'javascript' },
  cjs: { type: 'code', language: 'javascript' },
  jsx: { type: 'code', language: 'jsx' },
  ts: { type: 'code', language: 'typescript' },
  tsx: { type: 'code', language: 'tsx' },
  py: { type: 'code', language: 'python' },
  css: { type: 'code', language: 'css' },
  scss: { type: 'code', language: 'scss' },
  json: { type: 'code', language: 'json' },
  yaml: { type: 'code', language: 'yaml' },
  yml: { type: 'code', language: 'yaml' },
  toml: { type: 'code', language: 'toml' },
  xml: { type: 'code', language: 'xml' },
  sql: { type: 'code', language: 'sql' },
  sh: { type: 'code', language: 'bash' },
  txt: { type: 'code', language: 'text' },
  csv: { type: 'table', language: 'csv' },
};

/** Binary / non-text files we never try to surface as a text artifact. */
const BINARY_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'pdf', 'zip', 'gz',
  'tar', 'wasm', 'woff', 'woff2', 'ttf', 'otf', 'mp3', 'mp4', 'wav', 'parquet',
]);

function extOf(path: string): string {
  const base = path.split('/').pop() ?? path;
  const dot = base.lastIndexOf('.');
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : '';
}

export function classifySandboxFile(path: string): { type: ArtifactType; language?: string } | null {
  const ext = extOf(path);
  if (BINARY_EXT.has(ext)) return null;
  return EXT_TYPE[ext] ?? null;
}

/** Choose which file should auto-open in the Canvas (prefer an HTML entrypoint). */
function pickPrimary(paths: string[]): string | null {
  const score = (p: string): number => {
    const lower = p.toLowerCase();
    const base = lower.split('/').pop() ?? lower;
    if (base === 'index.html') return 100;
    if (lower.endsWith('.html') || lower.endsWith('.htm')) return 80;
    if (lower.endsWith('.svg')) return 60;
    if (lower.endsWith('.md')) return 40;
    return 10;
  };
  let best: string | null = null;
  let bestScore = -1;
  for (const p of paths) {
    const s = score(p);
    if (s > bestScore) { bestScore = s; best = p; }
  }
  return best;
}

/**
 * Promote changed VFS files for a session into the artifact store so the user
 * can preview/copy/download them. Returns the ids of promoted artifacts.
 */
export function promoteSandboxFiles(
  conversationId: string,
  messageNodeId: string,
  changedFiles: string[],
): string[] {
  if (!changedFiles || changedFiles.length === 0) return [];

  const promotable = changedFiles.filter((p) => classifySandboxFile(p) !== null);
  if (promotable.length === 0) return [];

  const primary = pickPrimary(promotable);
  const store = useAppStore.getState();
  const ids: string[] = [];

  for (const path of promotable) {
    const meta = classifySandboxFile(path);
    if (!meta) continue;
    const content = sandboxManager.readFile(conversationId, path);
    if (content === null) continue; // unreadable / binary — skip
    const id = store.upsertSandboxArtifact({
      conversationId,
      messageNodeId,
      path,
      content,
      type: meta.type,
      language: meta.language,
      activate: path === primary,
    });
    if (id) ids.push(id);
  }
  return ids;
}

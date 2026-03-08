/**
 * Artifact Detector
 * 
 * Scans streaming text for fenced code blocks, SVG, HTML documents,
 * mermaid diagrams, LaTeX blocks, and markdown tables.
 * Returns detected artifact metadata for canvas rendering.
 */

import type { ArtifactType } from '../types/artifacts';

export interface DetectedArtifact {
  type: ArtifactType;
  title: string;
  language?: string;
  content: string;
  startIndex: number;
  endIndex: number;
}

/** Language → artifact type mapping */
const LANG_TYPE_MAP: Record<string, ArtifactType> = {
  html: 'html',
  svg: 'svg',
  mermaid: 'mermaid',
  latex: 'latex',
  tex: 'latex',
  markdown: 'markdown',
  md: 'markdown',
};

const CODE_LANGUAGES: Set<string> = new Set([
  'javascript', 'js', 'typescript', 'ts', 'tsx', 'jsx',
  'python', 'py', 'rust', 'go', 'java', 'c', 'cpp', 'c++',
  'csharp', 'cs', 'ruby', 'rb', 'php', 'swift', 'kotlin',
  'shell', 'bash', 'sh', 'zsh', 'sql', 'json', 'yaml', 'yml',
  'toml', 'xml', 'css', 'scss', 'less', 'graphql', 'proto',
  'dockerfile', 'makefile', 'lua', 'r', 'dart', 'elixir',
  'erlang', 'haskell', 'scala', 'clojure', 'zig', 'nim',
]);

/** Infer artifact type from language tag */
function inferType(lang: string): ArtifactType {
  const lower = lang.toLowerCase().trim();
  if (LANG_TYPE_MAP[lower]) return LANG_TYPE_MAP[lower];
  if (CODE_LANGUAGES.has(lower)) return 'code';
  return 'code';
}

/** Generate title from language and content */
function inferTitle(lang: string, content: string): string {
  // Try to extract filename from first line comment
  const firstLine = content.split('\n')[0]?.trim() ?? '';
  const filePatterns = [
    /\/\/\s*(.+\.\w+)/, // // filename.ext
    /^#\s*(.+\.\w+)/,    // # filename.ext
    /<!--\s*(.+\.\w+)\s*-->/, // <!-- filename.ext -->
  ];
  for (const pat of filePatterns) {
    const m = firstLine.match(pat);
    if (m?.[1]) return m[1];
  }

  const typeMap: Record<string, string> = {
    html: 'HTML Document',
    svg: 'SVG Graphic',
    mermaid: 'Mermaid Diagram',
    latex: 'LaTeX Expression',
    markdown: 'Markdown Document',
  };
  const type = inferType(lang);
  if (typeMap[type]) return typeMap[type];
  return `${lang.toUpperCase()} Code`;
}

/** Regex for fenced code blocks */
const FENCED_BLOCK_RE = /```(\w+)?\s*\n([\s\S]*?)```/g;

/** Regex for standalone SVG tags */
const SVG_RE = /<svg[\s\S]*?<\/svg>/gi;

/** Regex for LaTeX display math */
const LATEX_DISPLAY_RE = /\$\$([\s\S]+?)\$\$/g;

/** Detect all artifacts in a text string */
export function detectArtifacts(text: string): DetectedArtifact[] {
  const artifacts: DetectedArtifact[] = [];
  const usedRanges: Array<[number, number]> = [];

  function overlaps(start: number, end: number): boolean {
    return usedRanges.some(([s, e]) => start < e && end > s);
  }

  // 1. Fenced code blocks
  let match: RegExpExecArray | null;
  FENCED_BLOCK_RE.lastIndex = 0;
  while ((match = FENCED_BLOCK_RE.exec(text)) !== null) {
    const lang = match[1] ?? 'text';
    const content = match[2] ?? '';
    const start = match.index;
    const end = start + match[0].length;

    // Skip tiny snippets (< 3 lines)
    if (content.split('\n').length < 3) continue;

    if (!overlaps(start, end)) {
      artifacts.push({
        type: inferType(lang),
        title: inferTitle(lang, content),
        language: lang.toLowerCase(),
        content: content.trim(),
        startIndex: start,
        endIndex: end,
      });
      usedRanges.push([start, end]);
    }
  }

  // 2. Standalone SVG (not inside fenced blocks)
  SVG_RE.lastIndex = 0;
  while ((match = SVG_RE.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (!overlaps(start, end)) {
      artifacts.push({
        type: 'svg',
        title: 'SVG Graphic',
        content: match[0],
        startIndex: start,
        endIndex: end,
      });
      usedRanges.push([start, end]);
    }
  }

  // 3. Display LaTeX
  LATEX_DISPLAY_RE.lastIndex = 0;
  while ((match = LATEX_DISPLAY_RE.exec(text)) !== null) {
    const content = match[1] ?? '';
    const start = match.index;
    const end = start + match[0].length;
    if (content.trim().length > 10 && !overlaps(start, end)) {
      artifacts.push({
        type: 'latex',
        title: 'LaTeX Expression',
        content: content.trim(),
        startIndex: start,
        endIndex: end,
      });
      usedRanges.push([start, end]);
    }
  }

  // Sort by position
  artifacts.sort((a, b) => a.startIndex - b.startIndex);
  return artifacts;
}

/** Check if text contains any renderable artifacts */
export function hasArtifacts(text: string): boolean {
  FENCED_BLOCK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FENCED_BLOCK_RE.exec(text)) !== null) {
    const content = match[2] ?? '';
    if (content.split('\n').length >= 3) return true;
  }
  SVG_RE.lastIndex = 0;
  if (SVG_RE.test(text)) return true;
  LATEX_DISPLAY_RE.lastIndex = 0;
  let m2: RegExpExecArray | null;
  while ((m2 = LATEX_DISPLAY_RE.exec(text)) !== null) {
    if ((m2[1] ?? '').trim().length > 10) return true;
  }
  return false;
}

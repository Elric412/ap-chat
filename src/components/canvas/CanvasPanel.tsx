/**
 * CanvasPanel
 * 
 * Side panel that renders detected artifacts (code, HTML, SVG,
 * markdown, mermaid, LaTeX) with version navigation and
 * copy/preview capabilities.
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import {
  X, Copy, Check, Code2, FileText, Image,
  ChevronLeft, ChevronRight, Layers, Eye, PenLine, Terminal,
} from 'lucide-react';
import { useAppStore } from '../../store';
import type { Artifact, ArtifactType } from '../../types/artifacts';
import { SandboxOutputView } from '../sandbox/SandboxOutputView';
import styles from './CanvasPanel.module.css';

const TYPE_ICONS: Record<ArtifactType, typeof Code2> = {
  code: Code2,
  markdown: FileText,
  svg: Image,
  html: FileText,
  table: Layers,
  mermaid: PenLine,
  latex: FileText,
};

const TYPE_LABELS: Record<ArtifactType, string> = {
  code: 'Code',
  markdown: 'Markdown',
  svg: 'SVG',
  html: 'HTML',
  table: 'Table',
  mermaid: 'Mermaid',
  latex: 'LaTeX',
};

export function CanvasPanel(): JSX.Element | null {
  const canvasOpen = useAppStore((s) => s.canvasOpen);
  const setCanvasOpen = useAppStore((s) => s.setCanvasOpen);
  const artifacts = useAppStore((s) => s.artifacts);
  const activeArtifactId = useAppStore((s) => s.activeArtifactId);
  const setActiveArtifact = useAppStore((s) => s.setActiveArtifact);
  const activeConversationId = useAppStore((s) => s.activeConversationId);
  const sandboxExecutions = useAppStore((s) =>
    activeConversationId ? (s.executions.get(activeConversationId) ?? []) : [],
  );

  const [copied, setCopied] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [view, setView] = useState<'artifacts' | 'sandbox'>('artifacts');

  if (!canvasOpen) return null;

  const activeArtifact = activeArtifactId ? artifacts.get(activeArtifactId) : null;
  const allArtifacts: Artifact[] = Array.from(artifacts.values() as Iterable<Artifact>).sort((a, b) => a.createdAt - b.createdAt);
  const showSandboxTab = sandboxExecutions.length > 0;
  const effectiveView = showSandboxTab ? view : 'artifacts';

  const activeContent = activeArtifact
    ? activeArtifact.versions[activeArtifact.activeVersionIndex]?.content ?? ''
    : '';

  const handleCopy = async () => {
    if (!activeContent) return;
    try {
      await navigator.clipboard.writeText(activeContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* noop */ }
  };

  const handleClose = () => setCanvasOpen(false);

  const canPreview = activeArtifact?.type === 'html' || activeArtifact?.type === 'svg';

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        {activeArtifact ? (
          <>
            <TypeIcon type={activeArtifact.type} />
            <div className={styles.titleGroup}>
              <div className={styles.title}>{activeArtifact.title}</div>
              <div className={styles.subtitle}>
                {TYPE_LABELS[activeArtifact.type]}
                {activeArtifact.language ? ` · ${activeArtifact.language}` : ''}
                {activeArtifact.versions.length > 1 ? ` · v${activeArtifact.activeVersionIndex + 1}` : ''}
              </div>
            </div>
          </>
        ) : (
          <div className={styles.titleGroup}>
            <div className={styles.title}>Canvas</div>
            <div className={styles.subtitle}>Artifacts</div>
          </div>
        )}

        <div className={styles.headerActions}>
          {showSandboxTab && (
            <button
              className={styles.headerBtn}
              onClick={() => setView(effectiveView === 'sandbox' ? 'artifacts' : 'sandbox')}
              aria-label="Toggle sandbox view"
              type="button"
              title={`${sandboxExecutions.length} execution${sandboxExecutions.length === 1 ? '' : 's'}`}
            >
              <Terminal size={14} />
            </button>
          )}
          {canPreview && effectiveView === 'artifacts' && (
            <button
              className={styles.headerBtn}
              onClick={() => setPreviewMode(!previewMode)}
              aria-label={previewMode ? 'Show source' : 'Preview'}
              type="button"
            >
              {previewMode ? <Code2 size={14} /> : <Eye size={14} />}
            </button>
          )}
          {effectiveView === 'artifacts' && (
            <button className={styles.headerBtn} onClick={handleCopy} aria-label="Copy" type="button">
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          )}
          <button className={styles.headerBtn} onClick={handleClose} aria-label="Close canvas" type="button">
            <X size={14} />
          </button>
        </div>
      </div>

      {effectiveView === 'sandbox' && activeConversationId ? (
        <div className={styles.contentArea}>
          <SandboxOutputView conversationId={activeConversationId} />
        </div>
      ) : (
        <>
          {/* Artifact list */}
          {allArtifacts.length > 1 && (
            <div className={styles.artifactList}>
              {allArtifacts.map((a) => (
                <button
                  key={a.id}
                  className={styles.artifactListItem}
                  data-active={a.id === activeArtifactId}
                  onClick={() => setActiveArtifact(a.id)}
                  type="button"
                >
                  <span className={styles.artifactDot} data-type={a.type} />
                  {a.title}
                </button>
              ))}
            </div>
          )}

          {/* Version bar */}
          {activeArtifact && activeArtifact.versions.length > 1 && (
            <VersionBar artifact={activeArtifact} />
          )}

          {/* Content */}
          <div className={styles.contentArea}>
            {!activeArtifact ? (
              <EmptyCanvas />
            ) : previewMode && canPreview ? (
              <PreviewRenderer content={activeContent} type={activeArtifact.type} />
            ) : activeArtifact.type === 'code' || activeArtifact.type === 'latex' ? (
              <CodeRenderer content={activeContent} />
            ) : activeArtifact.type === 'markdown' ? (
              <MarkdownRenderer content={activeContent} />
            ) : activeArtifact.type === 'mermaid' ? (
              <MermaidRenderer content={activeContent} />
            ) : activeArtifact.type === 'svg' ? (
              <SVGRenderer content={activeContent} />
            ) : activeArtifact.type === 'html' ? (
              <PreviewRenderer content={activeContent} type="html" />
            ) : (
              <CodeRenderer content={activeContent} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TypeIcon({ type }: { type: ArtifactType }) {
  const Icon = TYPE_ICONS[type] ?? Code2;
  return (
    <div className={styles.typeIcon}>
      <Icon size={14} />
    </div>
  );
}

function VersionBar({ artifact }: { artifact: Artifact }) {
  const updateVersion = useAppStore((s) => s.setActiveArtifact);
  // For now, we display version chips
  return (
    <div className={styles.versionBar}>
      {artifact.versions.map((v, i) => (
        <button
          key={v.id}
          className={styles.versionChip}
          data-active={i === artifact.activeVersionIndex}
          onClick={() => {
            // Update active version index in-place via store
            useAppStore.setState((state) => {
              const a = state.artifacts.get(artifact.id);
              if (a) a.activeVersionIndex = i;
            });
          }}
          type="button"
        >
          v{i + 1}
        </button>
      ))}
    </div>
  );
}

function CodeRenderer({ content }: { content: string }) {
  return (
    <div className={styles.codeView}>
      <pre className={styles.codeBlock}>{content}</pre>
    </div>
  );
}

function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className={styles.markdownView}>{content}</div>
  );
}

function MermaidRenderer({ content }: { content: string }) {
  return (
    <div className={styles.renderView}>
      <pre className={styles.renderContent}>{content}</pre>
    </div>
  );
}

function SVGRenderer({ content }: { content: string }) {
  // Security: Render SVG in a sandboxed iframe to prevent XSS from LLM-generated content
  const srcDoc = `<!DOCTYPE html><html><body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#fff">${content}</body></html>`;
  return (
    <iframe
      className={styles.previewFrame}
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      title="SVG preview"
    />
  );
}

function PreviewRenderer({ content, type }: { content: string; type: ArtifactType }) {
  const srcDoc = type === 'html'
    ? content
    : `<!DOCTYPE html><html><body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#fff">${content}</body></html>`;
  
  return (
    <iframe
      className={styles.previewFrame}
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      title="Artifact preview"
    />
  );
}

function EmptyCanvas() {
  return (
    <div className={styles.emptyState}>
      <Layers size={32} className={styles.emptyIcon} />
      <div className={styles.emptyTitle}>No artifacts yet</div>
      <div className={styles.emptyDesc}>
        Code blocks, HTML, SVG, and diagrams from assistant responses will appear here.
      </div>
    </div>
  );
}

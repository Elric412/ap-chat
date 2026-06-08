/**
 * SandboxOutputView
 *
 * Renders the execution log for a sandbox session inside the Canvas
 * panel: code, stdout, stderr, images, tables, files.
 */

import { useAppStore } from '../../store';
import type { SandboxExecutionResult, SandboxOutputChunk } from '../../sandbox/types';
import styles from './SandboxOutputView.module.css';

interface Props { conversationId: string; }

export function SandboxOutputView({ conversationId }: Props): JSX.Element {
  const executions = useAppStore((s) => s.executions.get(conversationId) ?? []);

  if (executions.length === 0) {
    return (
      <div className={styles.empty}>
        <div>No sandbox executions yet.</div>
        <div style={{ marginTop: 8, fontSize: 12 }}>
          Ask the model to compute something or run code — outputs appear here.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {executions.map((ex) => <ExecutionCard key={ex.executionId} execution={ex} />)}
    </div>
  );
}

function ExecutionCard({ execution }: { execution: SandboxExecutionResult }): JSX.Element {
  return (
    <div className={styles.execution}>
      <div className={styles.execHeader}>
        <span className={styles.statusDot} data-status={execution.status} />
        <span className={styles.lang}>{execution.language}</span>
        <span>{execution.status}</span>
        <span className={styles.duration}>{execution.durationMs} ms</span>
      </div>
      <pre className={styles.code}>{execution.code}</pre>
      <div className={styles.outputs}>
        {execution.outputs.map((o) => <OutputChunk key={o.id} chunk={o} />)}
        {execution.error && (
          <div className={styles.chunk} data-kind="error">
            <div className={styles.chunkLabel}>error</div>{execution.error}
          </div>
        )}
      </div>
      {execution.changedFiles.length > 0 && (
        <div className={styles.files}>
          <span>Files:</span>
          {execution.changedFiles.map((p) => (
            <span key={p} className={styles.fileChip}>{p}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function OutputChunk({ chunk }: { chunk: SandboxOutputChunk }): JSX.Element | null {
  switch (chunk.kind) {
    case 'stdout':
    case 'stderr':
    case 'result':
      return (
        <div className={styles.chunk} data-kind={chunk.kind}>
          <div className={styles.chunkLabel}>{chunk.kind}</div>
          {chunk.text}
        </div>
      );
    case 'image':
      return (
        <div className={styles.chunk} data-kind="image">
          <div className={styles.chunkLabel}>image</div>
          {chunk.dataUrl ? <img className={styles.image} src={chunk.dataUrl} alt="" /> : null}
        </div>
      );
    case 'html':
      return (
        <div className={styles.chunk} data-kind="html">
          <div className={styles.chunkLabel}>html</div>
          <div dangerouslySetInnerHTML={{ __html: chunk.text ?? '' }} />
        </div>
      );
    case 'table': {
      const data = (chunk.data as Array<Record<string, unknown>>) ?? [];
      if (!Array.isArray(data) || data.length === 0) return null;
      const headers = Array.from(new Set(data.flatMap((r) => Object.keys(r))));
      return (
        <div className={styles.chunk} data-kind="table">
          <div className={styles.chunkLabel}>table · {data.length} rows</div>
          <table className={styles.table}>
            <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {data.slice(0, 100).map((row, i) => (
                <tr key={i}>{headers.map((h) => <td key={h}>{String(row[h] ?? '')}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    default:
      return null;
  }
}

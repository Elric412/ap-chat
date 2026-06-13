/**
 * SwarmPanel — minimal but production-grade view of an in-flight swarm run.
 * Shows: task input + start/abort, DAG nodes with status, final answer.
 */
import { useState } from 'react';
import { X, Play, Square, GitBranch, Loader2, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import { useAppStore } from '../../store';
import styles from './SwarmPanel.module.css';

const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--color-muted-foreground)',
  ready: 'var(--color-primary)',
  running: 'var(--color-primary)',
  done: 'rgb(74 222 128)',
  failed: 'rgb(248 113 113)',
  skipped: 'var(--color-muted-foreground)',
};

export function SwarmPanel(): JSX.Element | null {
  const open = useAppStore((s) => s.panelOpen);
  const setOpen = useAppStore((s) => s.setSwarmPanelOpen);
  const start = useAppStore((s) => s.startSwarmRun);
  const abort = useAppStore((s) => s.abortSwarmRun);
  const reset = useAppStore((s) => s.resetSwarmRun);
  const status = useAppStore((s) => s.status);
  const graph = useAppStore((s) => s.graph);
  const nodeStatus = useAppStore((s) => s.nodeStatus);
  const nodeResults = useAppStore((s) => s.nodeResults);
  const finalAnswer = useAppStore((s) => s.finalAnswer);
  const errorMessage = useAppStore((s) => s.errorMessage);
  const running = useAppStore((s) => s.running);
  const cost = useAppStore((s) => s.cost);

  const [task, setTask] = useState('');

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task.trim() || running) return;
    await start(task.trim());
  };

  return (
    <aside className={styles.panel} aria-label="Agent swarm">
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <Sparkles size={16} />
          <h2 className={styles.title}>Agent Swarm</h2>
          <span className={styles.status} data-status={status}>{status}</span>
        </div>
        <button className={styles.iconBtn} onClick={() => setOpen(false)} aria-label="Close" type="button">
          <X size={14} />
        </button>
      </header>

      <form className={styles.composer} onSubmit={submit}>
        <textarea
          className={styles.textarea}
          placeholder="Describe a complex task. The swarm will decompose it into sub-tasks and synthesize one answer."
          value={task}
          onChange={(e) => setTask(e.target.value)}
          rows={3}
          disabled={running}
        />
        <div className={styles.actions}>
          {!running ? (
            <button className={styles.primaryBtn} type="submit" disabled={!task.trim()}>
              <Play size={14} /> Run
            </button>
          ) : (
            <button className={styles.dangerBtn} type="button" onClick={abort}>
              <Square size={14} /> Abort
            </button>
          )}
          <button className={styles.ghostBtn} type="button" onClick={reset} disabled={running}>
            Reset
          </button>
        </div>
      </form>

      {errorMessage && (
        <div className={styles.errorBanner}>
          <AlertCircle size={14} /> {errorMessage}
        </div>
      )}

      {graph && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <GitBranch size={13} /> Task graph · {graph.nodes.length} nodes
          </h3>
          <ul className={styles.nodeList}>
            {graph.nodes.map((n) => {
              const st = nodeStatus[n.id] ?? n.status;
              return (
                <li key={n.id} className={styles.node} data-status={st}>
                  <span className={styles.dot} style={{ background: STATUS_COLOR[st] }} />
                  <div className={styles.nodeBody}>
                    <div className={styles.nodeTitle}>
                      {n.title}
                      {st === 'running' && <Loader2 size={12} className={styles.spin} />}
                      {st === 'done' && <CheckCircle2 size={12} />}
                    </div>
                    <div className={styles.nodeInstruction}>{n.instruction}</div>
                    {nodeResults[n.id] && (
                      <details className={styles.nodeResult}>
                        <summary>Result</summary>
                        <pre>{nodeResults[n.id]}</pre>
                      </details>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {finalAnswer && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Final answer</h3>
          <div className={styles.finalAnswer}>{finalAnswer}</div>
        </section>
      )}

      {cost && (
        <footer className={styles.footer}>
          {cost.tokenCounts.input + cost.tokenCounts.output} tokens
          {Object.keys(cost.perAgent).length > 0 && ` · ${Object.keys(cost.perAgent).length} agents`}
        </footer>
      )}
    </aside>
  );
}

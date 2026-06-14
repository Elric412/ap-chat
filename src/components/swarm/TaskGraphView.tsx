/**
 * TaskGraphView — DAG node list with live status colors, depth indentation,
 * dependency hints, and per-node result disclosure.
 */
import { Loader2, CheckCircle2, GitBranch } from 'lucide-react';
import { useAppStore } from '../../store';
import type { TaskStatus } from '../../types/swarm/task-graph';
import styles from './SwarmPanel.module.css';

const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--color-muted-foreground)',
  ready: 'var(--color-primary)',
  running: 'var(--color-primary)',
  done: 'rgb(74 222 128)',
  failed: 'rgb(248 113 113)',
  skipped: 'var(--color-muted-foreground)',
};

export function TaskGraphView(): JSX.Element {
  const graph = useAppStore((s) => s.graph);
  const nodeStatus = useAppStore((s) => s.nodeStatus);
  const nodeResults = useAppStore((s) => s.nodeResults);

  if (!graph || graph.nodes.length === 0) {
    return <div className={styles.empty}>No task graph yet. Run a task to decompose it into a DAG.</div>;
  }

  return (
    <section className={styles.section} style={{ borderBottom: 'none' }}>
      <h3 className={styles.sectionTitle}>
        <GitBranch size={13} /> Task graph · {graph.nodes.length} nodes · {graph.edges.length} edges
      </h3>
      <ul className={styles.nodeList}>
        {graph.nodes.map((n) => {
          const st: TaskStatus = nodeStatus[n.id] ?? n.status;
          return (
            <li
              key={n.id}
              className={styles.node}
              data-status={st}
              style={{ paddingLeft: n.depth > 0 ? `${n.depth * 14}px` : undefined }}
            >
              <span className={styles.dot} style={{ background: STATUS_COLOR[st] }} />
              <div className={styles.nodeBody}>
                <div className={styles.nodeTitle}>
                  {n.title}
                  {st === 'running' && <Loader2 size={12} className={styles.spin} />}
                  {st === 'done' && <CheckCircle2 size={12} color={STATUS_COLOR.done} />}
                </div>
                <div className={styles.nodeInstruction}>{n.instruction}</div>
                {n.dependsOn.length > 0 && (
                  <div className={styles.nodeInstruction} style={{ opacity: 0.7 }}>
                    depends on {n.dependsOn.length} task{n.dependsOn.length > 1 ? 's' : ''}
                  </div>
                )}
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
  );
}

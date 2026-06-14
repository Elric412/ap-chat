/**
 * BlackboardView — KV inspector: key, value preview, version, writer, updatedAt.
 * Reads the live blackboard map synced into the swarm slice.
 */
import { useAppStore } from '../../store';
import type { BlackboardEntry } from '../../types/swarm/blackboard';
import styles from './SwarmPanel.module.css';

function preview(value: unknown): string {
  if (value == null) return '∅';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function shortWriter(writer: BlackboardEntry['writerAgentId']): string {
  if (writer === 'orchestrator') return 'orch';
  return writer.slice(0, 8);
}

export function BlackboardView(): JSX.Element {
  const blackboard = useAppStore((s) => s.blackboard);
  const entries = Object.values(blackboard).sort((a, b) => a.key.localeCompare(b.key));

  if (entries.length === 0) {
    return <div className={styles.empty}>The blackboard is empty. Entries appear as agents publish results.</div>;
  }

  return (
    <div className={styles.bbWrap}>
    <table className={styles.bbTable}>
      <thead>
        <tr>
          <th>Key</th>
          <th>Value</th>
          <th>Ver</th>
          <th>Writer</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.key}>
            <td className={styles.bbKey}>{e.key}</td>
            <td className={styles.bbValue} title={preview(e.value)}>{preview(e.value)}</td>
            <td className={styles.bbVersion}>{e.version}</td>
            <td className={styles.bbVersion}>{shortWriter(e.writerAgentId)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

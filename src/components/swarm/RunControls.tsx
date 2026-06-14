/**
 * RunControls — task composer + start/abort/retry + cost rollup readout.
 * Extracted from SwarmPanel for S14.
 */
import { useState } from 'react';
import { Play, Square, RotateCcw, AlertCircle } from 'lucide-react';
import { useAppStore } from '../../store';
import styles from './SwarmPanel.module.css';

export function RunControls(): JSX.Element {
  const start = useAppStore((s) => s.startSwarmRun);
  const abort = useAppStore((s) => s.abortSwarmRun);
  const reset = useAppStore((s) => s.resetSwarmRun);
  const running = useAppStore((s) => s.running);
  const errorMessage = useAppStore((s) => s.errorMessage);
  const rootTask = useAppStore((s) => s.rootTask);
  const cost = useAppStore((s) => s.cost);

  const [task, setTask] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = task.trim();
    if (!value || running) return;
    await start(value);
  };

  const retry = async () => {
    if (running || !rootTask) return;
    await start(rootTask);
  };

  return (
    <>
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
          {rootTask && !running && (
            <button className={styles.retryBtn} type="button" onClick={retry} title="Re-run the same task">
              <RotateCcw size={13} /> Retry
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

      {cost && (
        <div className={styles.costGrid}>
          <div className={styles.costItem}>
            <span className={styles.costLabel}>Input</span>
            <span className={styles.costValue}>{cost.tokenCounts.input.toLocaleString()}</span>
          </div>
          <div className={styles.costItem}>
            <span className={styles.costLabel}>Output</span>
            <span className={styles.costValue}>{cost.tokenCounts.output.toLocaleString()}</span>
          </div>
          <div className={styles.costItem}>
            <span className={styles.costLabel}>Agents</span>
            <span className={styles.costValue}>{Object.keys(cost.perAgent).length}</span>
          </div>
        </div>
      )}
    </>
  );
}

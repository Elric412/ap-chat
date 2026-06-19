/**
 * SwarmTrace — inline, collapsible observability panel attached to an assistant
 * message that was produced by an Agent Swarm run.
 *
 * It reads the live swarm slice (the app runs one swarm at a time) and renders a
 * compact status pill plus a tabbed surface (Graph · Agents · Board · Messages)
 * reusing the existing rich views. The final answer itself lives in the message
 * body — this panel is purely the "how it was made" trace.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Network, ChevronRight, GitBranch, Bot, Table2, MessagesSquare, Loader2,
} from 'lucide-react';
import { useAppStore } from '../../store';
import { TaskGraphView } from './TaskGraphView';
import { AgentListView } from './AgentCard';
import { BlackboardView } from './BlackboardView';
import { MessageLogView } from './MessageLogView';
import styles from './SwarmTrace.module.css';

type Tab = 'graph' | 'agents' | 'blackboard' | 'messages';

interface SwarmTraceProps {
  /** The swarmRunId stamped on the message metadata. */
  runId: string;
}

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  planning: 'Planning',
  running: 'Running',
  synthesizing: 'Synthesizing',
  done: 'Done',
  failed: 'Failed',
  aborted: 'Stopped',
};

export function SwarmTrace({ runId }: SwarmTraceProps): JSX.Element | null {
  const activeRunId = useAppStore((s) => s.activeRunId);
  const status = useAppStore((s) => s.status);
  const graph = useAppStore((s) => s.graph);
  const blackboard = useAppStore((s) => s.blackboard);
  const messages = useAppStore((s) => s.messages);
  const running = useAppStore((s) => s.running);
  const cost = useAppStore((s) => s.cost);

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('graph');

  // Only the run that produced *this* message is reflected in the live slice.
  const isThisRun = activeRunId === runId;
  if (!isThisRun) {
    // Older/persisted swarm message whose trace is no longer the active run.
    return (
      <div className={styles.wrap}>
        <button className={styles.toggle} type="button" disabled>
          <Network size={13} aria-hidden="true" />
          <span className={styles.toggleLabel}>Agent Swarm</span>
          <span className={styles.archived}>trace archived</span>
        </button>
      </div>
    );
  }

  const nodeCount = graph?.nodes.length ?? 0;
  const agentCount = (graph?.nodes ?? []).filter((n) => n.assignedAgentId).length;
  const bbCount = Object.keys(blackboard).length;
  const isLive = running && status !== 'done' && status !== 'failed' && status !== 'aborted';

  const tabs: { id: Tab; label: string; icon: JSX.Element; count?: number }[] = [
    { id: 'graph', label: 'Graph', icon: <GitBranch size={12} />, count: nodeCount || undefined },
    { id: 'agents', label: 'Agents', icon: <Bot size={12} />, count: agentCount || undefined },
    { id: 'blackboard', label: 'Board', icon: <Table2 size={12} />, count: bbCount || undefined },
    { id: 'messages', label: 'Messages', icon: <MessagesSquare size={12} />, count: messages.length || undefined },
  ];

  return (
    <div className={styles.wrap}>
      <button
        className={styles.toggle}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.2 }} className={styles.chevron}>
          <ChevronRight size={13} aria-hidden="true" />
        </motion.span>
        <Network size={13} aria-hidden="true" />
        <span className={styles.toggleLabel}>Agent Swarm</span>
        <span className={styles.statusPill} data-status={status}>
          {isLive && <Loader2 size={11} className={styles.spin} aria-hidden="true" />}
          {STATUS_LABEL[status] ?? status}
        </span>
        {nodeCount > 0 && (
          <span className={styles.meta}>
            {agentCount || nodeCount} agent{(agentCount || nodeCount) === 1 ? '' : 's'}
          </span>
        )}
        {cost && cost.tokenCounts.output > 0 && (
          <span className={styles.meta}>
            {(cost.tokenCounts.input + cost.tokenCounts.output).toLocaleString()} tok
          </span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className={styles.body}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <nav className={styles.tabs} role="tablist" aria-label="Swarm trace views">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  className={styles.tab}
                  data-active={tab === t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                >
                  {t.icon}
                  {t.label}
                  {t.count != null && <span className={styles.tabCount}>{t.count}</span>}
                </button>
              ))}
            </nav>
            <div className={styles.scroll}>
              {tab === 'graph' && <TaskGraphView />}
              {tab === 'agents' && <AgentListView />}
              {tab === 'blackboard' && <BlackboardView />}
              {tab === 'messages' && <MessageLogView />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

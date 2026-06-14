/**
 * SwarmPanel — container for an in-flight (or rehydrated) swarm run.
 * Hosts RunControls + a tabbed surface: Graph · Agents · Blackboard · Messages,
 * plus the synthesized final answer.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, GitBranch, Bot, Table2, MessagesSquare, Sparkles } from 'lucide-react';
import { useAppStore } from '../../store';
import { RunControls } from './RunControls';
import { TaskGraphView } from './TaskGraphView';
import { AgentListView } from './AgentCard';
import { BlackboardView } from './BlackboardView';
import { MessageLogView } from './MessageLogView';
import styles from './SwarmPanel.module.css';

type Tab = 'graph' | 'agents' | 'blackboard' | 'messages';

export function SwarmPanel(): JSX.Element | null {
  const open = useAppStore((s) => s.panelOpen);
  const setOpen = useAppStore((s) => s.setSwarmPanelOpen);
  const status = useAppStore((s) => s.status);
  const graph = useAppStore((s) => s.graph);
  const blackboard = useAppStore((s) => s.blackboard);
  const messages = useAppStore((s) => s.messages);
  const finalAnswer = useAppStore((s) => s.finalAnswer);

  const [tab, setTab] = useState<Tab>('graph');

  if (!open) return null;

  const agentCount = (graph?.nodes ?? []).filter((n) => n.assignedAgentId).length;
  const bbCount = Object.keys(blackboard).length;

  const tabs: { id: Tab; label: string; icon: JSX.Element; count?: number }[] = [
    { id: 'graph', label: 'Graph', icon: <GitBranch size={13} />, count: graph?.nodes.length },
    { id: 'agents', label: 'Agents', icon: <Bot size={13} />, count: agentCount || undefined },
    { id: 'blackboard', label: 'Board', icon: <Table2 size={13} />, count: bbCount || undefined },
    { id: 'messages', label: 'Messages', icon: <MessagesSquare size={13} />, count: messages.length || undefined },
  ];

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

      <RunControls />

      <nav className={styles.tabs} role="tablist">
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
            {tab === t.id && <motion.span layoutId="swarm-tab-underline" className={styles.tabUnderline} />}
          </button>
        ))}
      </nav>

      <div className={styles.scroll}>
        {tab === 'graph' && <TaskGraphView />}
        {tab === 'agents' && <AgentListView />}
        {tab === 'blackboard' && <BlackboardView />}
        {tab === 'messages' && <MessageLogView />}
      </div>

      {finalAnswer && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Final answer</h3>
          <div className={styles.finalAnswer}>{finalAnswer}</div>
        </section>
      )}
    </aside>
  );
}

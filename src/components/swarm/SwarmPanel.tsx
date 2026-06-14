/**
 * SwarmPanel — focused observability workspace for an in-flight (or rehydrated)
 * swarm run. Rendered as a modal-class drawer: a dimming backdrop focuses
 * attention on the run, the panel slides in from the right (full-screen sheet
 * on mobile), and the rest of the app stays untouched beneath it.
 *
 * Hosts RunControls + a tabbed surface: Graph · Agents · Board · Messages,
 * plus the synthesized final answer.
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, GitBranch, Bot, Table2, MessagesSquare, Network, Sparkles } from 'lucide-react';
import { useAppStore } from '../../store';
import { RunControls } from './RunControls';
import { TaskGraphView } from './TaskGraphView';
import { AgentListView } from './AgentCard';
import { BlackboardView } from './BlackboardView';
import { MessageLogView } from './MessageLogView';
import styles from './SwarmPanel.module.css';

type Tab = 'graph' | 'agents' | 'blackboard' | 'messages';

// iOS-like drawer curve (Emil / Ionic) for the slide-in.
const DRAWER_EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

export function SwarmPanel(): JSX.Element | null {
  const open = useAppStore((s) => s.panelOpen);
  const setOpen = useAppStore((s) => s.setSwarmPanelOpen);
  const status = useAppStore((s) => s.status);
  const graph = useAppStore((s) => s.graph);
  const blackboard = useAppStore((s) => s.blackboard);
  const messages = useAppStore((s) => s.messages);
  const finalAnswer = useAppStore((s) => s.finalAnswer);

  const [tab, setTab] = useState<Tab>('graph');

  // Close on Escape + lock body scroll while the drawer owns the viewport.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, setOpen]);

  const agentCount = (graph?.nodes ?? []).filter((n) => n.assignedAgentId).length;
  const bbCount = Object.keys(blackboard).length;
  const hasRun = (graph?.nodes.length ?? 0) > 0;

  const tabs: { id: Tab; label: string; icon: JSX.Element; count?: number }[] = [
    { id: 'graph', label: 'Graph', icon: <GitBranch size={13} />, count: graph?.nodes.length },
    { id: 'agents', label: 'Agents', icon: <Bot size={13} />, count: agentCount || undefined },
    { id: 'blackboard', label: 'Board', icon: <Table2 size={13} />, count: bbCount || undefined },
    { id: 'messages', label: 'Messages', icon: <MessagesSquare size={13} />, count: messages.length || undefined },
  ];

  return (
    <AnimatePresence>
      {open && (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Agent swarm">
          <motion.div
            className={styles.backdrop}
            onClick={() => setOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          />

          <motion.aside
            className={styles.panel}
            initial={{ transform: 'translateX(100%)' }}
            animate={{ transform: 'translateX(0%)' }}
            exit={{ transform: 'translateX(100%)' }}
            transition={{ duration: 0.32, ease: DRAWER_EASE }}
          >
            <header className={styles.header}>
              <div className={styles.titleGroup}>
                <span className={styles.titleIcon}>
                  <Network size={16} aria-hidden="true" />
                </span>
                <div className={styles.titleText}>
                  <h2 className={styles.title}>Agent Swarm</h2>
                  <span className={styles.subtitle}>Decompose · dispatch · synthesize</span>
                </div>
              </div>
              <div className={styles.titleGroup}>
                <span className={styles.status} data-status={status}>
                  <span className={styles.statusPulse} aria-hidden="true" />
                  {status}
                </span>
                <button className={styles.iconBtn} onClick={() => setOpen(false)} aria-label="Close swarm panel" type="button">
                  <X size={15} />
                </button>
              </div>
            </header>

            <RunControls />

            {!hasRun ? (
              <div className={styles.scroll}>
                <WelcomeState />
              </div>
            ) : (
              <>
                <nav className={styles.tabs} role="tablist" aria-label="Swarm views">
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
              </>
            )}

            {finalAnswer && (
              <section className={styles.finalSection}>
                <h3 className={styles.sectionTitle}>
                  <Sparkles size={13} /> Final answer
                </h3>
                <div className={styles.finalAnswer}>{finalAnswer}</div>
              </section>
            )}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

const HINTS = [
  'Describe a complex, multi-part task in the box above.',
  'The swarm decomposes it into a dependency graph of sub-tasks.',
  'Specialist agents run in parallel and synthesize one answer.',
];

function WelcomeState(): JSX.Element {
  return (
    <div className={styles.welcome}>
      <span className={styles.welcomeIcon}>
        <Network size={22} aria-hidden="true" />
      </span>
      <h3 className={styles.welcomeTitle}>Run your first swarm</h3>
      <p className={styles.welcomeBody}>
        Hand off a task too big for a single prompt — the swarm plans it, splits it, and runs it across agents.
      </p>
      <ol className={styles.welcomeHints}>
        {HINTS.map((hint, i) => (
          <li key={hint} className={styles.welcomeHint}>
            <span className={styles.welcomeHintNum}>{i + 1}</span>
            <span>{hint}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

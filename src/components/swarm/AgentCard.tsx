/**
 * AgentCard / AgentListView — per-agent status, role, skill badge, depth indent,
 * and live token count. Agents are derived from the graph nodes that have been
 * assigned an agent id, joined with the live agentStatus + cost.perAgent maps.
 */
import { Loader2, Bot } from 'lucide-react';
import { useAppStore } from '../../store';
import type { AgentStatus } from '../../types/swarm/agent';
import styles from './SwarmPanel.module.css';

interface DerivedAgent {
  agentId: string;
  title: string;
  depth: number;
  status: AgentStatus | 'idle';
  tokens: number;
}

export function AgentListView(): JSX.Element {
  const graph = useAppStore((s) => s.graph);
  const agentStatus = useAppStore((s) => s.agentStatus);
  const cost = useAppStore((s) => s.cost);

  const agents: DerivedAgent[] = (graph?.nodes ?? [])
    .filter((n) => n.assignedAgentId)
    .map((n) => {
      const agentId = n.assignedAgentId as string;
      const perAgent = cost?.perAgent[agentId];
      const tokens = perAgent ? perAgent.input + perAgent.output : 0;
      return {
        agentId,
        title: n.title,
        depth: n.depth,
        status: agentStatus[agentId] ?? 'idle',
        tokens,
      };
    });

  if (agents.length === 0) {
    return <div className={styles.empty}>No agents dispatched yet.</div>;
  }

  return (
    <ul className={styles.agentList}>
      {agents.map((a) => (
        <AgentCard key={a.agentId} agent={a} />
      ))}
    </ul>
  );
}

function AgentCard({ agent }: { agent: DerivedAgent }): JSX.Element {
  const active = agent.status === 'thinking' || agent.status === 'calling_tool' || agent.status === 'awaiting_child';
  return (
    <li className={styles.agentCard} style={{ marginLeft: agent.depth > 0 ? `${agent.depth * 12}px` : undefined }}>
      <div className={styles.agentTop}>
        {agent.depth > 0 && <span className={styles.depthIndent} />}
        <Bot size={15} aria-hidden="true" />
        <div className={styles.agentName}>{agent.title}</div>
        {active && <Loader2 size={13} className={styles.spin} aria-hidden="true" />}
      </div>
      <div className={styles.agentRole}>
        {agent.depth === 0 ? 'Root specialist' : `Spawned · depth ${agent.depth}`}
      </div>
      <div className={styles.agentBadges}>
        <span className={styles.statusBadge} data-status={agent.status}>{agent.status.replace('_', ' ')}</span>
        {agent.tokens > 0 && <span className={styles.badge}>{agent.tokens.toLocaleString()} tok</span>}
      </div>
    </li>
  );
}

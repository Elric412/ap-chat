/**
 * MessageLogView — append-only comms timeline of AgentMessages
 * (from → to, type, timestamp, and a short payload detail).
 */
import { useAppStore } from '../../store';
import type { AgentMessage, Endpoint, MessagePayload } from '../../types/swarm/messages';
import styles from './SwarmPanel.module.css';

function endpointLabel(e: Endpoint): string {
  switch (e.kind) {
    case 'orchestrator': return 'orch';
    case 'blackboard': return 'board';
    case 'agent': return e.agentId.slice(0, 6);
  }
}

function typeKind(type: MessagePayload['type']): string {
  if (type === 'task_error' || type === 'spawn_denied') return 'error';
  if (type === 'spawn_request' || type === 'spawn_granted') return 'spawn';
  if (type === 'task_result') return 'result';
  return 'default';
}

function detail(payload: MessagePayload): string {
  switch (payload.type) {
    case 'task_assigned': return payload.instruction;
    case 'task_result': return payload.output.slice(0, 160);
    case 'task_error': return formatErr(payload.error);
    case 'spawn_request': return payload.childInstruction;
    case 'spawn_denied': return formatErr(payload.reason);
    case 'blackboard_write': return `${payload.key} (v${payload.expectedVersion})`;
    case 'blackboard_read': return payload.key;
    case 'status_update': return payload.status;
    case 'cancel': return payload.reason;
    case 'log': return payload.text;
    case 'synthesize_request': return `${payload.resultKeys.length} keys`;
    case 'spawn_granted': return payload.childTaskId.slice(0, 8);
    default: return '';
  }
}

function formatErr(e: { kind: string; message?: string }): string {
  return e.message ? `${e.kind}: ${e.message}` : e.kind;
}

const fmtTime = (ts: number): string =>
  new Date(ts).toLocaleTimeString(undefined, { hour12: false, minute: '2-digit', second: '2-digit' });

export function MessageLogView(): JSX.Element {
  const messages = useAppStore((s) => s.messages);

  if (messages.length === 0) {
    return <div className={styles.empty}>No messages yet. The comms timeline fills as the swarm coordinates.</div>;
  }

  return (
    <ul className={styles.msgList}>
      {messages.map((m: AgentMessage) => (
        <li key={m.id} className={styles.msgRow}>
          <span className={styles.msgTime}>{fmtTime(m.timestamp)}</span>
          <div className={styles.msgBody}>
            <span className={styles.msgType} data-kind={typeKind(m.type)}>{m.type}</span>
            <div className={styles.msgRoute}>
              {endpointLabel(m.from)}<span className={styles.msgArrow}>→</span>{endpointLabel(m.to)}
            </div>
            <div className={styles.msgDetail}>{detail(m.payload)}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

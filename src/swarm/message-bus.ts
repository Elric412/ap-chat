/**
 * S10 — Message bus. Append-only log; pub/sub through the orchestrator.
 *
 * IMPORTANT: sub-agents NEVER import other sub-agent files. All inter-agent
 * communication flows through this bus, which the orchestrator owns. The
 * `from`/`to` endpoints are typed — but address-routing is the orchestrator's
 * job, not the bus's; the bus is a dumb log + fanout.
 */
import type { AgentMessage } from '../types/swarm/messages';

type Listener = (msg: AgentMessage) => void;

export class MessageBus {
  /** Append-only log. Ring-buffer cap to protect memory under heavy fan-out. */
  private readonly log: AgentMessage[] = [];
  private readonly cap: number;
  private readonly listeners = new Set<Listener>();

  constructor(cap = 1000) {
    this.cap = cap;
  }

  publish(msg: AgentMessage): void {
    this.log.push(msg);
    if (this.log.length > this.cap) this.log.shift();
    for (const l of this.listeners) {
      try { l(msg); } catch (e) { console.error('[MessageBus] listener error', e); }
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(): AgentMessage[] {
    return [...this.log];
  }

  clear(): void {
    this.log.length = 0;
  }
}

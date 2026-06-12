/**
 * Swarm run / blackboard / agent-message repositories.
 * Additive-only; mirrors messages-repo style.
 */
import { getDB } from './connection';
import { resilientIDB } from '../engine/resilience';
import type { SwarmRun } from '../types/swarm/run';
import type { SerializedGraph } from '../types/swarm/task-graph';
import type { BlackboardEntry } from '../types/swarm/blackboard';
import type { AgentMessage } from '../types/swarm/messages';
import type { RunId } from '../types/swarm/ids';

const RUNS = 'swarm_runs' as const;
const GRAPHS = 'swarm_graphs' as const;
const BB = 'blackboard_entries' as const;
const MSGS = 'agent_messages' as const;

export async function putRun(run: SwarmRun): Promise<void> {
  await resilientIDB(async () => {
    const db = await getDB();
    await db.put(RUNS as never, run as never);
  });
}

export async function listRuns(): Promise<SwarmRun[]> {
  return resilientIDB(async () => {
    const db = await getDB();
    return (await db.getAll(RUNS as never)) as SwarmRun[];
  }, []);
}

export async function putGraph(g: SerializedGraph): Promise<void> {
  await resilientIDB(async () => {
    const db = await getDB();
    await db.put(GRAPHS as never, g as never);
  });
}

export async function getGraph(runId: RunId): Promise<SerializedGraph | undefined> {
  return resilientIDB(async () => {
    const db = await getDB();
    const all = (await db.getAll(GRAPHS as never)) as SerializedGraph[];
    return all.find((g) => g.runId === runId);
  }, undefined);
}

export async function putBlackboardEntry(e: BlackboardEntry): Promise<void> {
  await resilientIDB(async () => {
    const db = await getDB();
    await db.put(BB as never, e as never);
  });
}

export async function listBlackboardEntries(runId: RunId): Promise<BlackboardEntry[]> {
  return resilientIDB(async () => {
    const db = await getDB();
    const all = (await db.getAll(BB as never)) as BlackboardEntry[];
    return all.filter((e) => e.runId === runId);
  }, []);
}

export async function putAgentMessage(m: AgentMessage): Promise<void> {
  await resilientIDB(async () => {
    const db = await getDB();
    await db.put(MSGS as never, m as never);
  });
}

export async function listAgentMessages(runId: RunId): Promise<AgentMessage[]> {
  return resilientIDB(async () => {
    const db = await getDB();
    const all = (await db.getAll(MSGS as never)) as AgentMessage[];
    return all.filter((m) => m.runId === runId).sort((a, b) => a.timestamp - b.timestamp);
  }, []);
}

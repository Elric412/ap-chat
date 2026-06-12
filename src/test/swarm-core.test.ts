/**
 * Tests for S03/S04/S06.
 */
import { describe, it, expect } from 'vitest';
import { TaskGraph } from '../swarm/task-graph';
import { Blackboard } from '../swarm/blackboard';
import { AgentPool } from '../swarm/agent-pool';
import {
  newGraphId, newRunId, newTaskId, newAgentId,
} from '../types/swarm/ids';
import type { TaskNode } from '../types/swarm/task-graph';

function mkNode(runId = newRunId()): TaskNode {
  return {
    id: newTaskId(),
    runId,
    title: 't',
    instruction: 'do',
    status: 'pending',
    depth: 0,
    dependsOn: [],
    assignedAgentId: null,
    suggestedSkillId: null,
    result: null,
    error: null,
    tokenUsage: null,
    startedAt: null,
    finishedAt: null,
  };
}

describe('TaskGraph', () => {
  it('rejects self-loop', () => {
    const runId = newRunId();
    const g = new TaskGraph(newGraphId(), runId);
    const a = mkNode(runId); g.addNode(a);
    const r = g.addEdge({ from: a.id, to: a.id, kind: 'depends_on' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('cycle_detected');
  });

  it('rejects cycle', () => {
    const runId = newRunId();
    const g = new TaskGraph(newGraphId(), runId);
    const a = mkNode(runId), b = mkNode(runId), c = mkNode(runId);
    g.addNode(a); g.addNode(b); g.addNode(c);
    expect(g.addEdge({ from: a.id, to: b.id, kind: 'depends_on' }).ok).toBe(true);
    expect(g.addEdge({ from: b.id, to: c.id, kind: 'depends_on' }).ok).toBe(true);
    const r = g.addEdge({ from: c.id, to: a.id, kind: 'depends_on' });
    expect(r.ok).toBe(false);
  });

  it('topo + ready set advance as nodes complete', () => {
    const runId = newRunId();
    const g = new TaskGraph(newGraphId(), runId);
    const a = mkNode(runId), b = mkNode(runId), c = mkNode(runId);
    g.addNode(a); g.addNode(b); g.addNode(c);
    g.addEdge({ from: a.id, to: c.id, kind: 'depends_on' });
    g.addEdge({ from: b.id, to: c.id, kind: 'depends_on' });
    const topo = g.topologicalOrder();
    expect(topo.ok).toBe(true);
    let ready = g.getReadyNodes().map((n) => n.id);
    expect(ready).toContain(a.id);
    expect(ready).toContain(b.id);
    expect(ready).not.toContain(c.id);
    g.markStatus(a.id, 'done');
    g.markStatus(b.id, 'done');
    ready = g.getReadyNodes().map((n) => n.id);
    expect(ready).toEqual([c.id]);
  });
});

describe('Blackboard', () => {
  it('CAS write succeeds on matching version and conflicts otherwise', () => {
    const bb = new Blackboard(newRunId());
    const r1 = bb.write('k', { v: 1 }, 0, 'orchestrator');
    expect(r1.ok).toBe(true);
    const r2 = bb.write('k', { v: 2 }, 0, 'orchestrator');
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.kind).toBe('version_conflict');
    const r3 = bb.write('k', { v: 2 }, 1, 'orchestrator');
    expect(r3.ok).toBe(true);
    if (r3.ok) expect(r3.value.version).toBe(2);
  });

  it('update retries on conflict and converges', () => {
    const bb = new Blackboard(newRunId());
    const writer = newAgentId();
    bb.write('counter', 0, 0, 'orchestrator');
    // Simulate two concurrent updaters interleaved by hand.
    const r1 = bb.update<number>('counter', (n) => (n ?? 0) + 1, writer);
    const r2 = bb.update<number>('counter', (n) => (n ?? 0) + 1, writer);
    expect(r1.ok && r2.ok).toBe(true);
    expect(bb.read<number>('counter')?.value).toBe(2);
  });
});

describe('AgentPool', () => {
  it('enforces max concurrency', async () => {
    const pool = new AgentPool(2);
    let inFlight = 0, maxObserved = 0;
    const job = async () => {
      inFlight++; maxObserved = Math.max(maxObserved, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight--;
    };
    await Promise.all(Array.from({ length: 8 }, () => pool.submit(() => job())));
    expect(maxObserved).toBeLessThanOrEqual(2);
  });

  it('abortAll signals in-flight work', async () => {
    const pool = new AgentPool(2);
    let aborted = false;
    const p = pool.submit(async (signal) => {
      await new Promise<void>((resolve, reject) => {
        signal.addEventListener('abort', () => { aborted = true; reject(new DOMException('a', 'AbortError')); });
        setTimeout(resolve, 500);
      });
    });
    setTimeout(() => pool.abortAll(), 10);
    await expect(p).rejects.toBeDefined();
    expect(aborted).toBe(true);
  });
});

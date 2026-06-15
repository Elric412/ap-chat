/**
 * Tests for S03/S04/S06 plus the remaining S09-S12 swarm wiring.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Skill } from '../types/skills';
import type { AgentLLMRequest } from '../swarm/agent-llm';
import type { IMemoryStore, MemoryRecord } from '../types/swarm/memory';
import type { RunEvent } from '../types/swarm/run';
import { TaskGraph } from '../swarm/task-graph';
import { Blackboard } from '../swarm/blackboard';
import { AgentPool } from '../swarm/agent-pool';
import {
  Ok,
  newAgentId,
  newGraphId,
  newMemoryId,
  newRunId,
  newTaskId,
} from '../types/swarm/ids';
import type { TaskNode } from '../types/swarm/task-graph';
import { Orchestrator, defaultSwarmConfig } from '../swarm/orchestrator';

const { runAgentLLMMock } = vi.hoisted(() => ({
  runAgentLLMMock: vi.fn(),
}));

vi.mock('../swarm/agent-llm', async () => {
  const actual = await vi.importActual<typeof import('../swarm/agent-llm')>('../swarm/agent-llm');
  return {
    ...actual,
    runAgentLLM: runAgentLLMMock,
  };
});

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
    agentRole: null,
    agentSystemPrompt: null,
    result: null,
    error: null,
    tokenUsage: null,
    startedAt: null,
    finishedAt: null,
  };
}

function usage(inputTokens: number, outputTokens: number) {
  return {
    inputTokens,
    outputTokens,
    thinkingTokens: 0,
    cachedTokens: 0,
    totalTokens: inputTokens + outputTokens,
  };
}

function createMemoryStub(records: MemoryRecord[] = []): IMemoryStore {
  return {
    recall: vi.fn(async (query) => Ok(
      records.filter((record) => !query.scope || record.scope === query.scope),
    )),
    remember: vi.fn(async () => Ok(newMemoryId())),
    promote: vi.fn(async () => Ok(undefined)),
    evictWorking: vi.fn(async () => undefined),
  };
}

async function collectRun(orchestrator: Orchestrator, task: string) {
  const events: RunEvent[] = [];
  const generator = orchestrator.run(task, new AbortController().signal);

  while (true) {
    const next = await generator.next();
    if (next.done) {
      return { events, result: next.value };
    }
    events.push(next.value);
  }
}

const backendSkill: Skill = {
  id: 'skill-backend-developer',
  name: 'Backend Developer',
  description: 'Backend architecture specialist',
  instructions: 'Use robust API and database design patterns.',
  category: 'backend',
  tags: ['api', 'database', 'security'],
  icon: '⚙️',
  isBuiltin: true,
  enabled: true,
  createdAt: 0,
  updatedAt: 0,
};

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

  it('spawned edges do not block child execution readiness', () => {
    const runId = newRunId();
    const g = new TaskGraph(newGraphId(), runId);
    const parent = mkNode(runId);
    const child = mkNode(runId);
    g.addNode(parent);
    g.addNode(child);
    expect(g.addEdge({ from: parent.id, to: child.id, kind: 'spawned' }).ok).toBe(true);
    expect(g.getReadyNodes().map((node) => node.id)).toContain(child.id);
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

describe('Orchestrator swarm wiring', () => {
  beforeEach(() => {
    runAgentLLMMock.mockReset();
  });

  it('routes skills, injects recalled memory, and streams live message events', async () => {
    const memoryStore = createMemoryStub([
      {
        id: newMemoryId(),
        scope: 'episodic',
        runId: newRunId(),
        kind: 'summary',
        agentId: null,
        content: 'Prior outage handling required secure API retries and audit logs.',
        embedding: null,
        tags: ['api', 'security'],
        salience: 0.9,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
      },
    ]);

    const llmCalls: AgentLLMRequest[] = [];
    runAgentLLMMock.mockImplementation(async (request: AgentLLMRequest) => {
      llmCalls.push(request);
      if (llmCalls.length === 1) {
        return Ok({ text: 'Implemented the secure API design.', tokenUsage: usage(20, 12) });
      }
      return Ok({ text: 'Final user-facing answer.', tokenUsage: usage(8, 14) });
    });

    const orchestrator = new Orchestrator({
      config: defaultSwarmConfig('google', 'gemini-3-flash-preview'),
      availableSkills: [backendSkill],
      memoryStore,
    });

    const { events, result } = await collectRun(orchestrator, 'Build secure backend API');

    expect(result.ok).toBe(true);
    expect(events.some((event) => event.type === 'message' && event.message.type === 'task_assigned')).toBe(true);
    expect(events.some((event) => event.type === 'message' && event.message.type === 'task_result')).toBe(true);
    expect(events.some((event) => event.type === 'blackboard')).toBe(true);

    const subAgentMessages = llmCalls[0].messages
      .flatMap((message) => message.content)
      .filter((content): content is { type: 'text'; text: string } => content.type === 'text')
      .map((content) => content.text)
      .join('\n');

    expect(subAgentMessages).toContain('Use robust API and database design patterns.');
    expect(subAgentMessages).toContain('Relevant recalled memory for this sub-task');
    expect(subAgentMessages).toContain('Prior outage handling required secure API retries and audit logs.');

    expect(vi.mocked(memoryStore.remember)).toHaveBeenCalled();
    expect(vi.mocked(memoryStore.evictWorking)).toHaveBeenCalledTimes(1);
  });

  it('creates real spawned child nodes through the orchestrator and bubbles their results up', async () => {
    const memoryStore = createMemoryStub();

    runAgentLLMMock
      .mockResolvedValueOnce(Ok({ text: '{"spawnInstruction":"Research the schema details"}', tokenUsage: usage(10, 6) }))
      .mockResolvedValueOnce(Ok({ text: 'Child schema result', tokenUsage: usage(7, 9) }))
      .mockResolvedValueOnce(Ok({ text: 'Parent answer using child result', tokenUsage: usage(9, 11) }))
      .mockResolvedValueOnce(Ok({ text: 'Final synthesized answer', tokenUsage: usage(5, 8) }));

    const orchestrator = new Orchestrator({
      config: defaultSwarmConfig('google', 'gemini-3-flash-preview'),
      memoryStore,
    });

    const { events, result } = await collectRun(orchestrator, 'Explain API schema');

    expect(result.ok).toBe(true);

    const graphEvents = events.filter((event): event is Extract<RunEvent, { type: 'graph_built' }> => event.type === 'graph_built');
    expect(graphEvents.length).toBeGreaterThan(1);
    expect(graphEvents.at(-1)?.graph.nodes).toHaveLength(2);

    const messageTypes = events
      .filter((event): event is Extract<RunEvent, { type: 'message' }> => event.type === 'message')
      .map((event) => event.message.type);
    expect(messageTypes).toContain('spawn_request');
    expect(messageTypes).toContain('spawn_granted');

    const doneResults = events
      .filter((event): event is Extract<RunEvent, { type: 'node_status' }> => event.type === 'node_status' && event.status === 'done')
      .map((event) => event.result);
    expect(doneResults).toContain('Child schema result');
    expect(doneResults).toContain('Parent answer using child result');

    const blackboardOutputs = events
      .filter((event): event is Extract<RunEvent, { type: 'blackboard' }> => event.type === 'blackboard')
      .map((event) => String(event.entry.value));
    expect(blackboardOutputs).toContain('Child schema result');
  });
});

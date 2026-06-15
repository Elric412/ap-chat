/**
 * Swarm UI slice — wires the Orchestrator to the store and surfaces
 * RunEvents (graph, node statuses, messages, final answer) for the panel.
 *
 * S13: persistence — runs/graphs/blackboard/messages are streamed to IndexedDB
 * as events arrive, and the most recent run is rehydrated on load so a refresh
 * mid-/post-run restores the full swarm surface.
 */
import type { StateCreator } from 'zustand';
import { Orchestrator, defaultSwarmConfig } from '../swarm/orchestrator';
import type { SerializedGraph, TaskStatus } from '../types/swarm/task-graph';
import type { AgentStatus } from '../types/swarm/agent';
import type { SwarmRun, RunStatus } from '../types/swarm/run';
import type { AgentId, TaskId, RunId } from '../types/swarm/ids';
import type { ProviderId } from '../types/models';
import type { AgentMessage } from '../types/swarm/messages';
import type { BlackboardEntry } from '../types/swarm/blackboard';
import { MODEL_REGISTRY } from '../constants/model-registry';
import {
  putRun,
  putGraph,
  putBlackboardEntry,
  putAgentMessage,
  listRuns,
  getGraph,
  listBlackboardEntries,
  listAgentMessages,
} from '../db/swarm-repo';

export interface SwarmSliceState {
  panelOpen: boolean;
  activeRunId: RunId | null;
  status: RunStatus;
  rootTask: string;
  graph: SerializedGraph | null;
  nodeStatus: Record<string, TaskStatus>;
  agentStatus: Record<string, AgentStatus>;
  nodeResults: Record<string, string>;
  blackboard: Record<string, BlackboardEntry>;
  finalAnswer: string | null;
  errorMessage: string | null;
  messages: AgentMessage[];
  cost: SwarmRun['cost'] | null;
  running: boolean;
  rehydrated: boolean;
}

export interface SwarmSlice extends SwarmSliceState {
  setSwarmPanelOpen: (open: boolean) => void;
  startSwarmRun: (task: string) => Promise<void>;
  abortSwarmRun: () => void;
  resetSwarmRun: () => void;
  rehydrateSwarm: () => Promise<void>;
}

const INITIAL: SwarmSliceState = {
  panelOpen: false,
  activeRunId: null,
  status: 'queued',
  rootTask: '',
  graph: null,
  nodeStatus: {},
  agentStatus: {},
  nodeResults: {},
  blackboard: {},
  finalAnswer: null,
  errorMessage: null,
  messages: [],
  cost: null,
  running: false,
  rehydrated: false,
};

let activeOrchestrator: Orchestrator | null = null;

export const createSwarmSlice: StateCreator<
  SwarmSlice,
  [['zustand/immer', never]],
  [],
  SwarmSlice
> = (set, get) => ({
  ...INITIAL,

  setSwarmPanelOpen: (open) => set((s) => { s.panelOpen = open; }),

  abortSwarmRun: () => {
    activeOrchestrator?.abort();
    set((s) => { s.running = false; });
  },

  resetSwarmRun: () => {
    activeOrchestrator?.abort();
    activeOrchestrator = null;
    set((s) => { Object.assign(s, INITIAL, { panelOpen: s.panelOpen, rehydrated: s.rehydrated }); });
  },

  /** S13: rehydrate the most recent run (and its graph/blackboard/messages) on load. */
  rehydrateSwarm: async () => {
    if (get().rehydrated || get().running) return;
    try {
      const runs = await listRuns();
      if (runs.length === 0) {
        set((s) => { s.rehydrated = true; });
        return;
      }
      const latest = runs.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
      const [graph, entries, messages] = await Promise.all([
        getGraph(latest.id),
        listBlackboardEntries(latest.id),
        listAgentMessages(latest.id),
      ]);

      set((s) => {
        if (s.running) return; // a live run started meanwhile — don't clobber it
        s.activeRunId = latest.id;
        // A run interrupted by a refresh is no longer executing.
        s.status = latest.status === 'running' || latest.status === 'planning' || latest.status === 'synthesizing'
          ? 'aborted'
          : latest.status;
        s.rootTask = latest.rootTask;
        s.finalAnswer = latest.finalAnswer;
        s.cost = latest.cost;
        s.errorMessage = latest.error ? formatErr(latest.error) : null;
        s.graph = graph ?? null;
        s.blackboard = {};
        for (const e of entries) s.blackboard[e.key] = e;
        s.messages = messages;

        // Reconstruct per-node status/result from the persisted graph + blackboard.
        s.nodeStatus = {};
        s.nodeResults = {};
        if (graph) {
          for (const n of graph.nodes) {
            const statusEntry = entries.find((e) => e.key === `task:${n.id}:status`);
            s.nodeStatus[n.id] = (statusEntry?.value as TaskStatus) ?? n.status;
            const outEntry = entries.find((e) => e.key === `task:${n.id}:output`);
            if (typeof outEntry?.value === 'string') s.nodeResults[n.id] = outEntry.value;
            else if (n.result) s.nodeResults[n.id] = n.result;
          }
        }
        s.rehydrated = true;
      });
    } catch (e) {
      console.error('[swarm] rehydrate failed', e);
      set((s) => { s.rehydrated = true; });
    }
  },

  startSwarmRun: async (task) => {
    if (get().running) return;

    // Resolve provider/model from current UI selection.
    const selectedId = (get() as unknown as { selectedModelId?: string }).selectedModelId
      ?? 'gemini-3-flash-preview';
    const model = MODEL_REGISTRY.find((m) => m.id === selectedId);
    const provider: ProviderId = (model?.providerId as ProviderId) ?? 'google';
    const modelId = model?.id ?? 'gemini-3-flash-preview';

    const cfg = defaultSwarmConfig(provider, modelId);
    const skillsGetter = (get() as unknown as { getAvailableSkills?: () => unknown[] }).getAvailableSkills;
    const availableSkills = (typeof skillsGetter === 'function' ? skillsGetter() : []) as never;
    const orch = new Orchestrator({
      config: cfg,
      availableSkills,
    });
    activeOrchestrator = orch;

    set((s) => {
      Object.assign(s, INITIAL, { panelOpen: true, rehydrated: true });
      s.running = true;
      s.rootTask = task;
      s.activeRunId = orch.getRun().id;
    });

    // Persist the initial run record so a refresh during planning still finds it.
    void persistRun(orch.getRun());

    const controller = new AbortController();
    try {
      const gen = orch.run(task, controller.signal);
      while (true) {
        const next = await gen.next();
        if (next.done) break;
        const ev = next.value as import('../types/swarm/run').RunEvent;
        set((s) => {
          switch (ev.type) {
            case 'run_status': s.status = ev.status; break;
            case 'graph_built': s.graph = ev.graph; break;
            case 'node_status':
              s.nodeStatus[ev.taskId] = ev.status;
              if (ev.result) s.nodeResults[ev.taskId] = ev.result;
              break;
            case 'agent_status': s.agentStatus[ev.agentId] = ev.status; break;
            case 'message': s.messages.push(ev.message); break;
            case 'blackboard': s.blackboard[ev.entry.key] = ev.entry; break;
            case 'final':
              s.finalAnswer = ev.answer;
              s.cost = ev.cost;
              break;
            case 'error':
              s.errorMessage = formatErr(ev.error);
              break;
          }
        });

        // S13: stream persistence — best-effort, never blocks the run loop.
        switch (ev.type) {
          case 'graph_built': void putGraph(ev.graph).catch(() => undefined); break;
          case 'blackboard': void putBlackboardEntry(ev.entry).catch(() => undefined); break;
          case 'message': void putAgentMessage(ev.message).catch(() => undefined); break;
          case 'run_status':
          case 'final':
          case 'error':
            void persistRun(orch.getRun());
            break;
        }
      }
    } catch (e) {
      set((s) => { s.errorMessage = e instanceof Error ? e.message : String(e); });
    } finally {
      // Sync bus messages once at the end (covers any messages emitted between polls).
      const messages = (orch as { getMessages?: () => AgentMessage[] }).getMessages?.() ?? [];
      const finalRun = orch.getRun();
      set((s) => {
        s.messages = messages;
        s.cost = finalRun.cost;
        s.running = false;
      });
      // Final authoritative persist.
      void persistRun(finalRun);
      for (const m of messages) void putAgentMessage(m).catch(() => undefined);
    }
  },
});

/** Best-effort run persistence (run records carry the live cost rollup). */
function persistRun(run: SwarmRun): void {
  void putRun(run).catch(() => undefined);
}

function formatErr(e: unknown): string {
  if (e && typeof e === 'object' && 'kind' in e) {
    const k = (e as { kind: string }).kind;
    const m = (e as { message?: string }).message;
    return m ? `${k}: ${m}` : k;
  }
  return String(e);
}
// Used types kept for tree-shake clarity.
void ({} as AgentId);
void ({} as TaskId);

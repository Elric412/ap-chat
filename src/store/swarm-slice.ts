/**
 * Swarm UI slice — wires the Orchestrator to the store and surfaces
 * RunEvents (graph, node statuses, messages, final answer) for the panel.
 */
import type { StateCreator } from 'zustand';
import { Orchestrator, defaultSwarmConfig } from '../swarm/orchestrator';
import type { SerializedGraph, TaskStatus } from '../types/swarm/task-graph';
import type { AgentStatus } from '../types/swarm/agent';
import type { SwarmRun, RunStatus } from '../types/swarm/run';
import type { AgentId, TaskId, RunId } from '../types/swarm/ids';
import type { ProviderId } from '../types/models';
import type { AgentMessage } from '../types/swarm/messages';
import { MODEL_REGISTRY } from '../constants/model-registry';

export interface SwarmSliceState {
  panelOpen: boolean;
  activeRunId: RunId | null;
  status: RunStatus;
  rootTask: string;
  graph: SerializedGraph | null;
  nodeStatus: Record<string, TaskStatus>;
  agentStatus: Record<string, AgentStatus>;
  nodeResults: Record<string, string>;
  finalAnswer: string | null;
  errorMessage: string | null;
  messages: AgentMessage[];
  cost: SwarmRun['cost'] | null;
  running: boolean;
}

export interface SwarmSlice extends SwarmSliceState {
  setSwarmPanelOpen: (open: boolean) => void;
  startSwarmRun: (task: string) => Promise<void>;
  abortSwarmRun: () => void;
  resetSwarmRun: () => void;
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
  finalAnswer: null,
  errorMessage: null,
  messages: [],
  cost: null,
  running: false,
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
    set((s) => { Object.assign(s, INITIAL, { panelOpen: s.panelOpen }); });
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
    const orch = new Orchestrator({ config: cfg });
    activeOrchestrator = orch;

    set((s) => {
      Object.assign(s, INITIAL, { panelOpen: true });
      s.running = true;
      s.rootTask = task;
      s.activeRunId = orch.getRun().id;
    });

    const controller = new AbortController();
    try {
      const gen = orch.run(task, controller.signal);
      // eslint-disable-next-line no-constant-condition
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
            case 'final':
              s.finalAnswer = ev.answer;
              s.cost = ev.cost;
              break;
            case 'error':
              s.errorMessage = formatErr(ev.error);
              break;
          }
        });
      }
    } catch (e) {
      set((s) => { s.errorMessage = e instanceof Error ? e.message : String(e); });
    } finally {
      // Sync bus messages once at the end.
      const messages = (orch as { getMessages?: () => AgentMessage[] }).getMessages?.() ?? [];
      const finalRun = orch.getRun();
      set((s) => {
        s.messages = messages;
        s.cost = finalRun.cost;
        s.running = false;
      });
    }
  },
});

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

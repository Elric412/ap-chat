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
import type { MessageNode } from '../types/messages';
import { MODEL_REGISTRY } from '../constants/model-registry';
import { PROVIDER_META } from '../constants/provider-meta';
import { DEFAULT_PARAMETERS } from '../constants/default-parameters';
import { uuidv7 } from '../lib/uuid';
import { putMessages } from '../db/messages-repo';
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

interface ResolvedSwarmModel {
  ok: boolean;
  provider: ProviderId;
  modelId: string;
  /** Present only when ok === false. */
  error: string | null;
}

export interface SwarmSliceState {
  /** Swarm is now a chat *mode* (mirrors comparisonMode), not a drawer. */
  swarmMode: boolean;
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
  setSwarmMode: (active: boolean) => void;
  setSwarmPanelOpen: (open: boolean) => void;
  startSwarmRun: (task: string) => Promise<void>;
  /** Run the swarm and surface the result as a real assistant message inline in chat. */
  runSwarmInChat: (conversationId: string, text: string, parentId: string | null, rootNodeId: string) => Promise<void>;
  abortSwarmRun: () => void;
  resetSwarmRun: () => void;
  rehydrateSwarm: () => Promise<void>;
}

const INITIAL: SwarmSliceState = {
  swarmMode: false,
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

  setSwarmMode: (active) => set((s) => { s.swarmMode = active; }),

  setSwarmPanelOpen: (open) => set((s) => { s.panelOpen = open; }),

  abortSwarmRun: () => {
    activeOrchestrator?.abort();
    set((s) => { s.running = false; });
  },

  resetSwarmRun: () => {
    activeOrchestrator?.abort();
    activeOrchestrator = null;
    set((s) => { Object.assign(s, INITIAL, { panelOpen: s.panelOpen, rehydrated: s.rehydrated, swarmMode: s.swarmMode }); });
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
    const resolved: ResolvedSwarmModel = resolveSwarmModel(get);
    if (!resolved.ok) {
      const error = resolved.error ?? 'Swarm could not start.';
      set((s) => {
        Object.assign(s, INITIAL, { panelOpen: true, rehydrated: true, swarmMode: s.swarmMode });
        s.errorMessage = error;
        s.rootTask = task;
      });
      emitToast(get, error);
      return;
    }
    set((s) => { s.panelOpen = true; });
    await executeSwarm(set, get, task, { onFinal: undefined });
  },

  /**
   * Run the swarm and surface the synthesized answer as a real assistant
   * message in the active conversation — so it persists, branches, and
   * exports like any other reply, with a live trace attached via swarmRunId.
   */
  runSwarmInChat: async (conversationId, text, parentId, rootNodeId) => {
    if (get().running) return;

    const resolved: ResolvedSwarmModel = resolveSwarmModel(get);
    if (!resolved.ok) {
      const error = resolved.error ?? 'Swarm could not start.';
      emitToast(get, error);
      set((s) => { s.errorMessage = error; });
      return;
    }

    // 1. Create the user node + a streaming assistant node up front so the
    //    swarm trace renders inline immediately (mirrors useStream wiring).
    const userNodeId = uuidv7();
    const assistantNodeId = uuidv7();
    const actualParentId = parentId ?? rootNodeId;
    const now = Date.now();

    const userNode = makeNode({
      id: userNodeId,
      conversationId,
      parentId: actualParentId,
      role: 'user',
      content: [{ type: 'text', text }],
      timestamp: now,
    });

    const assistantNode = makeNode({
      id: assistantNodeId,
      conversationId,
      parentId: userNodeId,
      role: 'assistant',
      content: [{ type: 'text', text: '' }],
      model: resolved.modelId,
      provider: resolved.provider,
      status: 'streaming',
      timestamp: now,
      metadata: { pinned: false, bookmarked: false },
    });

    const storeAny = get() as unknown as {
      messageMap: Map<string, MessageNode>;
    };

    set((s) => {
      const map = (s as unknown as { messageMap: Map<string, MessageNode> }).messageMap;
      const parent = map.get(actualParentId);
      if (parent) {
        parent.childIds.push(userNodeId);
        parent.activeChildIndex = parent.childIds.length - 1;
        parent._clock += 1;
      }
      userNode.childIds = [assistantNodeId];
      userNode.activeChildIndex = 0;
      map.set(userNodeId, userNode);
      map.set(assistantNodeId, assistantNode);
    });

    // 2. Run the swarm; once we have the run id, stamp it on the assistant node.
    let stamped = false;
    await executeSwarm(set, get, text, {
      onRunId: (runId) => {
        if (stamped) return;
        stamped = true;
        set((s) => {
          const map = (s as unknown as { messageMap: Map<string, MessageNode> }).messageMap;
          const node = map.get(assistantNodeId);
          if (node) {
            node.metadata = { ...node.metadata, swarmRunId: runId };
            node._clock += 1;
          }
        });
      },
      onFinal: (answer, errorMessage, cost) => {
        set((s) => {
          const map = (s as unknown as { messageMap: Map<string, MessageNode> }).messageMap;
          const node = map.get(assistantNodeId);
          if (!node) return;
          if (errorMessage && !answer) {
            node.status = 'error';
            node.content = [{ type: 'text', text: '' }];
            node.error = { type: 'unknown', message: errorMessage, retryable: true };
          } else {
            node.status = 'complete';
            node.content = [{ type: 'text', text: answer ?? '' }];
          }
          if (cost) {
            node.tokenCounts = {
              input: cost.tokenCounts.input,
              output: cost.tokenCounts.output,
              thinking: cost.tokenCounts.thinking,
              cached: cost.tokenCounts.cached,
            };
          }
          node.latency = Date.now() - now;
          node._clock += 1;
        });
      },
    });

    // 3. Persist the chat nodes.
    const map = storeAny.messageMap;
    const nodes: MessageNode[] = [];
    const parent = map.get(actualParentId);
    if (parent) nodes.push(parent);
    const finalUser = map.get(userNodeId);
    const finalAssistant = map.get(assistantNodeId);
    if (finalUser) nodes.push(finalUser);
    if (finalAssistant) nodes.push(finalAssistant);
    await putMessages(nodes).catch(() => undefined);
  },
});

/** Resolve the provider/model the swarm should use from the current UI selection. */
function resolveSwarmModel(get: () => SwarmSlice): ResolvedSwarmModel {
  const root = get() as unknown as {
    selectedModelId?: string;
    keyRecords?: Array<{ providerId: ProviderId }>;
    vaultStatus?: string;
  };
  const selectedId = root.selectedModelId;
  const model = MODEL_REGISTRY.find((m) => m.id === selectedId);
  if (!model) {
    return { ok: false, provider: 'openai', modelId: '', error: 'No model selected. Pick a model before running the swarm.' };
  }
  const provider = model.providerId as ProviderId;

  // ollama is keyless; everything else needs a vault key for the chosen provider.
  if (provider !== 'ollama') {
    const hasKey = (root.keyRecords ?? []).some((r) => r.providerId === provider);
    if (!hasKey) {
      const label = PROVIDER_META[provider]?.displayName ?? provider;
      const reason = root.vaultStatus === 'unlocked'
        ? `Add a ${label} API key in the Vault to run the swarm with ${model.displayName}.`
        : `Unlock your Vault and add a ${label} API key to run the swarm with ${model.displayName}.`;
      return { ok: false, provider, modelId: model.id, error: reason };
    }
  }
  return { ok: true, provider, modelId: model.id, error: null };
}

interface ExecuteSwarmHooks {
  onRunId?: (runId: RunId) => void;
  onFinal?: (answer: string | null, errorMessage: string | null, cost: SwarmRun['cost'] | null) => void;
}

/**
 * Shared swarm execution loop. Drives the orchestrator generator, streams
 * RunEvents into the swarm slice (graph/agents/board/messages), persists
 * incrementally, and invokes hooks so callers can mirror the result into chat.
 */
async function executeSwarm(
  set: (fn: (s: SwarmSlice) => void) => void,
  get: () => SwarmSlice,
  task: string,
  hooks: ExecuteSwarmHooks,
): Promise<void> {
  const resolved: ResolvedSwarmModel = resolveSwarmModel(get);
  if (!resolved.ok) {
    const error = resolved.error ?? 'Swarm could not start.';
    hooks.onFinal?.(null, error, null);
    return;
  }

  const cfg = defaultSwarmConfig(resolved.provider, resolved.modelId);
  const skillsGetter = (get() as unknown as { getAvailableSkills?: () => unknown[] }).getAvailableSkills;
  const availableSkills = (typeof skillsGetter === 'function' ? skillsGetter() : []) as never;
  const orch = new Orchestrator({ config: cfg, availableSkills });
  activeOrchestrator = orch;

  set((s) => {
    Object.assign(s, INITIAL, { panelOpen: s.panelOpen, rehydrated: true, swarmMode: s.swarmMode });
    s.running = true;
    s.rootTask = task;
    s.activeRunId = orch.getRun().id;
  });
  hooks.onRunId?.(orch.getRun().id);

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
    const messages = (orch as { getMessages?: () => AgentMessage[] }).getMessages?.() ?? [];
    const finalRun = orch.getRun();
    set((s) => {
      s.messages = messages;
      s.cost = finalRun.cost;
      s.running = false;
    });
    void persistRun(finalRun);
    for (const m of messages) void putAgentMessage(m).catch(() => undefined);

    const answer = finalRun.finalAnswer;
    const errorMessage = finalRun.error ? formatErr(finalRun.error) : (answer ? null : get().errorMessage);
    hooks.onFinal?.(answer, errorMessage, finalRun.cost);
  }
}

/** Build a full MessageNode with sensible defaults (mirrors messages-slice). */
function makeNode(
  overrides: Partial<MessageNode> & Pick<MessageNode, 'id' | 'conversationId' | 'parentId' | 'role' | 'content'>,
): MessageNode {
  return {
    branchId: overrides.id,
    childIds: [],
    activeChildIndex: 0,
    model: null,
    provider: null,
    parameters: DEFAULT_PARAMETERS,
    tokenCounts: { input: 0, output: 0, thinking: 0, cached: 0 },
    costEstimate: { inputCost: 0, outputCost: 0, thinkingCost: 0, cachedDiscount: 0, totalCost: 0 },
    timestamp: Date.now(),
    latency: null,
    status: 'complete',
    toolCalls: [],
    toolResults: [],
    thinkingContent: null,
    attachmentIds: [],
    webSearchResults: [],
    artifactRefs: [],
    comparisonId: null,
    summaryRefs: [],
    metadata: { pinned: false, bookmarked: false },
    _clock: 0,
    _deleted: false,
    ...overrides,
  };
}

function emitToast(get: () => SwarmSlice, title: string): void {
  const addToast = (get() as unknown as {
    addToast?: (t: { type: 'error'; title: string; dismissible: boolean; duration?: number }) => void;
  }).addToast;
  addToast?.({ type: 'error', title, dismissible: true, duration: 6000 });
}

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

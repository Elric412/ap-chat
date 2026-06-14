# Agent Swarm System — Architecture & Implementation Plan

> **Project:** BYOK Chat (`vite_react_shadcn_ts`) — a browser-only, multi-provider LLM chat app.
> **Goal:** Add an **Agent Swarm** layer (Orchestrator → Sub-Agent Pool → Blackboard) plus a **Memory layer**, **Smart Skill Routing**, and **UI enhancements** — entirely client-side, type-safe, and resilient.
> **Stack:** Vite 6 · React 18 · TypeScript 5.8 (strict) · Zustand 5 + Immer · Zod 4 · IndexedDB (`idb`) · shadcn-ui · Tailwind 3.
> **Skills applied:** `typescript-pro`, `planning-and-task-breakdown`, `data-modeling`, `database-design`, `dispatching-parallel-agents`.

---

## 0. How to read this document

This plan follows the **typescript-pro** discipline: **types first, implementation second**. Sections 1–4 capture intent and architecture. **Section 5 contains the full data models and class interfaces** (the deliverable you asked to see *before* any implementation). Sections 6–11 cover the slice plan, memory, routing, UI, persistence, testing, and risks.

Nothing in this document writes application code yet. It is a **planning artifact**. The first implementation commit is the *output* of this plan firing on **Slice S01**.

---

## 1. Intent Capture (typescript-pro Phase 1)

```
TASK:   Add a client-side agent-swarm orchestration layer + memory + smart skill
        routing + UI to an existing BYOK multi-provider chat app.
MODE:   brownfield (extend; never silently rewrite existing modules)
SHAPE:  user task ──▶ Orchestrator ──decompose(LLM)──▶ Task DAG
        Task DAG ──assign──▶ Sub-Agent Pool (parallel, isolated context, depth≤3)
        Sub-Agents ──read/write──▶ Blackboard (optimistic-locked KV)
        Blackboard ──collect──▶ Orchestrator ──synthesize(LLM)──▶ final answer
        cross-cutting: Memory layer (recall/store) + Skill Router (which specialist)

ACCEPTANCE CRITERIA:
  - Orchestrator decomposes a task into a DAG (not a flat list) with typed edges.
  - Sub-agents run concurrently via async/await with a bounded concurrency pool.
  - Each sub-agent has an isolated context window (no leakage of sibling context).
  - Recursive spawning is allowed but hard-capped at depth 3.
  - Blackboard is the ONLY shared mutable surface; writes use optimistic locking.
  - No direct sub-agent → sub-agent calls; all comms via Orchestrator/Blackboard.
  - Message schema is exactly { from, to, type, payload, timestamp } (+ id, correlationId).
  - Memory layer persists and recalls across sessions (IndexedDB).
  - Skill routing picks specialists from the EXISTING skill library.
  - UI shows the live DAG, per-agent status, blackboard, and message log.
  - tsc --noEmit clean, eslint clean, no circular deps, vitest green.

ASSUMED DEFAULTS (not asked, obviously needed):
  - Reuse existing ProviderAdapter registry — do NOT add a new HTTP layer.
  - Reuse existing resilience.ts (CircuitBreaker / retry / timeout) for every LLM call.
  - Reuse existing _clock LWW pattern for blackboard optimistic locking.
  - Zod schemas at every boundary (LLM JSON output, persistence, cross-agent messages).
  - Branded IDs (TaskId, AgentId, RunId, MemoryId…) to prevent ID mix-ups.
  - Discriminated unions for every status/state machine; assertNever exhaustiveness.
  - Result<T,E> for every fallible op; throw only on programmer error.
  - Everything runs client-side; respects BYOK keys already in the Vault.

SCOPE BOUNDARIES:
  IN:  orchestrator, sub-agent pool, blackboard, agent comms bus, memory layer,
       skill router, persistence, UI panels, tests, types.
  OUT: server-side execution, real shell/file tools, multi-user collaboration,
       billing changes. (Surfaced for a later phase.)

WOW DEFAULTS APPLIED:
  - Branded IDs everywhere            (compile-time ID safety)
  - DAG with cycle detection          (prevents infinite task loops)
  - Optimistic-lock CAS on blackboard (race-free shared state)
  - Bounded async pool + AbortSignal  (no runaway fan-out, cancellable)
  - Result types + typed errors        (expected failures are values)
  - Zod at every untrusted edge        (LLM output is untrusted)
  - Reused CircuitBreaker per provider (chaos-proven LLM calls)
```

---

## 2. Deep Dive — What the existing app already gives us

A full read of `src/` before planning (per the brief). Key findings that the swarm **reuses rather than reinvents**:

| Area | Existing asset | How the swarm reuses it |
|------|----------------|--------------------------|
| **LLM transport** | `src/adapters/registry.ts` → `getAdapter(providerId)` returning `ProviderAdapter.stream()` as `AsyncGenerator<NormalizedStreamEvent>` | Every agent's LLM call goes through this. No new transport. |
| **Streaming protocol** | `NormalizedStreamEvent` (`message_start`, `delta_text`, `delta_thinking`, `tool_call`, `citation`, `usage`, `message_end`, `error`) in `src/types/adapters.ts` | Agents consume the same event stream; orchestrator aggregates `usage` for cost. |
| **Resilience** | `src/engine/resilience.ts` — `CircuitBreaker`, retry w/ exp backoff, timeout guard, bulkhead | Wrap every agent LLM call; one breaker per provider; pool = bulkhead. |
| **State** | Zustand + Immer **sliced** store (`src/store/index.ts`); slices for ui/vault/sessions/messages/artifacts/comparison/system-prompts/skills | Add `swarm-slice`, `blackboard-slice`, `memory-slice` following the identical `StateCreator<Slice,[['zustand/immer',never]],[],Slice>` pattern. |
| **Persistence** | IndexedDB via `idb`, `src/db/connection.ts` (`getDB`, versioned `upgrade`), repos in `src/db/*-repo.ts` | Bump `DB_VERSION`; add object stores `swarm_runs`, `blackboard_entries`, `memory_records`, `agent_messages`. |
| **Optimistic concurrency** | `MessageNode._clock` + `_deleted` LWW fields (`src/types/messages.ts`) | Blackboard entries carry a `version` integer; writes are compare-and-swap on `version` — same philosophy. |
| **Skill library** | `src/types/skills.ts` (`Skill`, `SkillLibraryConfig`, single/two-pass), `src/engine/skill-injector.ts`, `src/store/skills-slice.ts`, `src/constants/built-in-skills.ts` | Skill Router selects which `Skill` becomes each sub-agent's persona/system prompt. No new skill model. |
| **Context budgeting** | `src/engine/context-engine.ts` (`buildContextWindow`, token estimates, pinning, summarize) | Each isolated sub-agent context is built with `buildContextWindow` against its own message list. |
| **Tools** | `src/engine/tool-executor.ts` (registry + `executeTool`, web_search), `src/types/tools.ts` | Sub-agent `toolNames[]` reference this registry; executor stays the single tool entry point. |
| **Branded-ish IDs / uuid** | `src/lib/uuid.ts` (`uuidv7`) | Generate all swarm IDs; brand them at the type level. |
| **UI** | shadcn-ui + Tailwind + CSS modules, `react-router-dom`, pages in `src/pages`, panels in `src/components/*` | Add a `SwarmPanel` route/drawer; reuse existing card/badge/scroll-area primitives. |
| **Cost** | `src/engine/cost-calculator.ts`, `CostEstimate`/`TokenCounts` | Aggregate per-agent token usage into a run-level cost rollup. |

**Conclusion:** the swarm is an **orchestration layer on top of existing primitives**, not a parallel stack. This is what keeps the plan small and the slices vertical.

### Existing module map (relevant subset)

```
src/
├── adapters/        registry.ts, types.ts (ProviderAdapter), <provider>/adapter.ts
├── engine/          resilience.ts, context-engine.ts, tool-executor.ts,
│                    skill-injector.ts, cost-calculator.ts, state-integrity.ts
├── store/           index.ts (combine), *-slice.ts (immer slices)
├── db/              connection.ts, schema.ts, *-repo.ts
├── types/           messages.ts, models.ts, adapters.ts, skills.ts, tools.ts …
├── components/      chat/, skills/, layout/, ui/ (shadcn) …
├── hooks/           use-stream.ts, use-cloud-sync.ts …
└── pages/           ChatPage.tsx, SettingsPage.tsx, AuthPage.tsx
```

### New module map (what this plan adds)

```
src/
├── types/swarm/
│   ├── ids.ts            branded IDs + Zod
│   ├── messages.ts       AgentMessage envelope { from,to,type,payload,timestamp }
│   ├── task-graph.ts     TaskNode, TaskEdge, TaskGraph (DAG)
│   ├── agent.ts          AgentSpec, AgentRuntime, AgentStatus
│   ├── blackboard.ts     BlackboardEntry, locking types
│   ├── memory.ts         MemoryRecord, MemoryQuery, MemoryScope
│   ├── routing.ts        RouteRequest, RouteDecision
│   └── run.ts            SwarmRun, RunStatus, RunEvent
├── swarm/
│   ├── orchestrator.ts        Orchestrator class
│   ├── decomposer.ts          LLM task → DAG (Zod-validated)
│   ├── synthesizer.ts         results → final answer
│   ├── task-graph.ts          TaskGraph impl (DAG, topo-sort, cycle check)
│   ├── sub-agent.ts           SubAgent class (isolated context, spawn)
│   ├── agent-pool.ts          bounded async pool (bulkhead)
│   ├── blackboard.ts          Blackboard class (optimistic CAS)
│   ├── message-bus.ts         MessageBus (pub/sub through orchestrator)
│   ├── memory/
│   │   ├── memory-store.ts     MemoryStore facade
│   │   ├── working-memory.ts   per-run scratch
│   │   ├── episodic-memory.ts  past runs/messages
│   │   └── retriever.ts        keyword/embedding-lite recall
│   └── routing/
│       ├── skill-router.ts     specialist selection (reuses Skill library)
│       └── scorer.ts           heuristic + optional LLM scorer
├── store/
│   ├── swarm-slice.ts
│   ├── blackboard-slice.ts
│   └── memory-slice.ts
├── db/
│   ├── swarm-repo.ts
│   ├── blackboard-repo.ts
│   └── memory-repo.ts
└── components/swarm/
    ├── SwarmPanel.tsx          container
    ├── TaskGraphView.tsx       DAG visualization
    ├── AgentCard.tsx           per-agent status
    ├── BlackboardView.tsx      KV inspector
    ├── MessageLogView.tsx      comms timeline
    └── RunControls.tsx         start/abort/retry
```

---

## 3. System Architecture (component view)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                 UI LAYER                                   │
│  SwarmPanel · TaskGraphView · AgentCard · BlackboardView · MessageLogView  │
└───────────────▲───────────────────────────────────────────────┬──────────┘
                │ selectors (read-only)                          │ actions
                │                                                ▼
┌───────────────┴────────────────────────────────────────────────────────────┐
│                       ZUSTAND STORE (immer slices)                           │
│        swarm-slice          blackboard-slice           memory-slice          │
└───────────────▲───────────────────▲───────────────────────▲─────────────────┘
                │ subscribe          │ read/write CAS         │ recall/store
┌───────────────┴────────────────────┴───────────────────────┴─────────────────┐
│                          ORCHESTRATOR (single conductor)                      │
│   1. decompose(task) ─LLM→ TaskGraph (DAG)                                     │
│   2. schedule ready nodes → AgentPool (bounded concurrency, AbortSignal)      │
│   3. route each node → SkillRouter → AgentSpec (persona = Skill)              │
│   4. collect results from Blackboard                                          │
│   5. synthesize(results) ─LLM→ final answer                                   │
│   ── all agent comms flow THROUGH here or the Blackboard ──                   │
└───────┬─────────────────────────┬───────────────────────────┬────────────────┘
        │ spawn (depth≤3)          │ publish/subscribe          │ CAS write
        ▼                          ▼                            ▼
┌───────────────┐         ┌─────────────────┐        ┌───────────────────────┐
│  SUB-AGENT     │  ◀────  │   MESSAGE BUS    │  ────▶ │      BLACKBOARD        │
│  POOL          │         │ {from,to,type,   │        │  KV + version (CAS)    │
│  · isolated ctx│         │  payload,ts}     │        │  task_id/status/output │
│  · ProviderApi │         │  (no A↔A direct) │        │  /errors/timestamps    │
│  · CircuitBkr  │         └─────────────────┘        └───────────────────────┘
└───────┬────────┘                                              ▲
        │ recall / store                                        │
        ▼                                                       │
┌──────────────────────────────────────────────────────────────┴──────────────┐
│                            MEMORY LAYER                                       │
│   working (per-run) · episodic (past runs) · semantic recall (retriever)     │
└───────────────────────────────────────────────────────────────────────────────┘
                              │ persisted via
                              ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│  INDEXEDDB (idb)  — swarm_runs · blackboard_entries · agent_messages · memory   │
│  REUSED: adapters/registry · engine/resilience · engine/context-engine          │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Communication invariants (enforced by types + lint)

1. **No A↔A imports.** `sub-agent.ts` must not import another sub-agent. (Enforced by `madge --circular` + a lint rule note.)
2. **Single writer surface.** The only mutable shared object is the `Blackboard`. Everything else is message-passing.
3. **Orchestrator is the conductor.** Sub-agents return results to the orchestrator/blackboard; they never address a sibling directly — `AgentMessage.to` may be an `AgentId` *only* when routed *through* the bus, which delivers via the orchestrator.
4. **Depth cap.** `SubAgent.spawnChild()` returns `Result<…, MaxDepthError>` when `depth >= 3`.

---

## 4. Domain Model (data-modeling Phase) — Entities, relationships, invariants

### Entities

| Entity | Identity | Key attributes | Lifecycle / invariants |
|--------|----------|----------------|------------------------|
| **SwarmRun** | `RunId` (uuidv7) | rootTaskId, status, graphId, createdAt, finishedAt, costRollup | `queued → planning → running → (synthesizing) → done \| failed \| aborted`. A run owns exactly one TaskGraph. |
| **TaskNode** | `TaskId` | runId, title, instruction, assignedAgentId?, status, depth, result?, error? | `pending → ready → running → done \| failed \| skipped`. `depth ∈ [0,3]`. A node is `ready` only when all `dependsOn` are `done`. |
| **TaskEdge** | (`from`,`to`) composite | from `TaskId`, to `TaskId`, kind | DAG only: adding an edge that creates a cycle is rejected. |
| **TaskGraph** | `GraphId` | runId, nodes Map, edges[] | Always acyclic. Has ≥1 root (no deps). |
| **AgentSpec** | `AgentId` | name, role, systemPrompt, skillId?, toolNames[], model, provider | Immutable blueprint. `skillId` references existing `Skill`. |
| **AgentRuntime** | `AgentId` | spec, status, taskId, parentAgentId?, depth, contextWindowId, tokenUsage | Isolated context per agent. `depth = parent.depth+1`. |
| **BlackboardEntry** | `key: string` | value (JSON), version, writerAgentId, updatedAt, runId | Optimistic lock: write succeeds iff `expectedVersion === currentVersion`; then `version++`. |
| **AgentMessage** | `MessageId` | from, to, type, payload, timestamp, correlationId, runId | Immutable, append-only log. `from`/`to` ∈ {`'orchestrator'`, `'blackboard'`, AgentId}. |
| **MemoryRecord** | `MemoryId` | scope, runId?, agentId?, kind, content, embedding?, tags[], salience, createdAt | `scope ∈ {working, episodic, semantic}`. Working memory is GC'd at run end unless promoted. |
| **RouteDecision** | derived | taskId, candidates[], chosenSkillId?, chosenAgentRole, reasoning, score | Pure function output; not persisted (logged in run events). |

### Relationships

```
SwarmRun 1───1 TaskGraph 1───N TaskNode N───N TaskNode (via TaskEdge, DAG)
SwarmRun 1───N AgentRuntime ───(spec)── AgentSpec ──(skillId?)── Skill (existing)
TaskNode 0..1───1 AgentRuntime              (a node is worked by one agent)
AgentRuntime 0..1───N AgentRuntime          (parent → children, self-referential, depth≤3)
SwarmRun 1───N BlackboardEntry              (keyspace scoped by runId)
SwarmRun 1───N AgentMessage                 (append-only comms log)
SwarmRun 1───N MemoryRecord (working)       (+ episodic/semantic span many runs)
```

### Invariants enforced in types / code

- `TaskGraph` rejects cycles (`addEdge` returns `Result`).
- `AgentRuntime.depth ≤ 3`; spawn beyond → `MaxDepthError`.
- `BlackboardEntry.version` is monotonic; CAS prevents lost updates.
- A `TaskNode` transitions to `running` only from `ready`.
- `AgentMessage` log is append-only (no edit/delete).
- Every LLM-derived object (`TaskGraph`, `RouteDecision`) is **Zod-parsed** before use.

---

## 5. Data Models & Class Interfaces (TYPES FIRST — the deliverable)

> Per **typescript-pro Phase 3**, every type below is designed *before* any function body. All LLM-output and persisted shapes derive from a **Zod schema** (`type T = z.infer<typeof TSchema>`) — one source of truth. IDs are **branded**. State machines are **discriminated unions**. Fallible ops return **`Result<T,E>`**.

### 5.1 Branded IDs & Result — `src/types/swarm/ids.ts`

```typescript
import { z } from 'zod';

/** Brand helper — a nominal type that is structurally a string at runtime. */
declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type RunId      = Brand<string, 'RunId'>;
export type GraphId    = Brand<string, 'GraphId'>;
export type TaskId     = Brand<string, 'TaskId'>;
export type AgentId    = Brand<string, 'AgentId'>;
export type MessageId  = Brand<string, 'MessageId'>;
export type MemoryId   = Brand<string, 'MemoryId'>;
export type CorrelationId = Brand<string, 'CorrelationId'>;

/** Zod brands — validate at boundaries, infer branded type out. */
export const RunIdSchema     = z.string().uuid().brand<'RunId'>();
export const GraphIdSchema   = z.string().uuid().brand<'GraphId'>();
export const TaskIdSchema    = z.string().uuid().brand<'TaskId'>();
export const AgentIdSchema   = z.string().uuid().brand<'AgentId'>();
export const MessageIdSchema = z.string().uuid().brand<'MessageId'>();
export const MemoryIdSchema  = z.string().uuid().brand<'MemoryId'>();

/** Constructors (use existing src/lib/uuid.ts uuidv7 under the hood). */
export const newRunId:     () => RunId     = () => uuidv7() as RunId;
export const newGraphId:   () => GraphId   = () => uuidv7() as GraphId;
export const newTaskId:    () => TaskId    = () => uuidv7() as TaskId;
export const newAgentId:   () => AgentId   = () => uuidv7() as AgentId;
export const newMessageId: () => MessageId = () => uuidv7() as MessageId;
export const newMemoryId:  () => MemoryId  = () => uuidv7() as MemoryId;

/** Result — failure is a value, not an exception. */
export type Result<T, E = SwarmError> =
  | { readonly ok: true;  readonly value: T }
  | { readonly ok: false; readonly error: E };

export const Ok  = <T>(value: T): Result<T, never>  => ({ ok: true, value });
export const Err = <E>(error: E): Result<never, E>  => ({ ok: false, error });

/** Exhaustiveness guard (mirrors typescript-pro assets/assertNever.ts). */
export function assertNever(x: never): never {
  throw new Error(`Unreachable: ${JSON.stringify(x)}`);
}
```

### 5.2 Typed errors — `src/types/swarm/errors.ts`

```typescript
/** Discriminated union of every expected swarm failure. */
export type SwarmError =
  | { kind: 'decompose_failed';   message: string; raw?: unknown }
  | { kind: 'invalid_llm_output'; message: string; zodIssues: unknown }
  | { kind: 'cycle_detected';     from: TaskId; to: TaskId }
  | { kind: 'max_depth';          depth: number; limit: 3 }
  | { kind: 'version_conflict';   key: string; expected: number; actual: number }
  | { kind: 'agent_failed';       agentId: AgentId; taskId: TaskId; cause: string }
  | { kind: 'aborted';            runId: RunId }
  | { kind: 'provider_error';     classified: ClassifiedError } // reuse types/adapters.ts
  | { kind: 'memory_error';       message: string }
  | { kind: 'no_route';           taskId: TaskId; message: string };

export class MaxDepthError extends Error {
  readonly kind = 'max_depth' as const;
  constructor(public readonly depth: number) {
    super(`Sub-agent spawn depth ${depth} exceeds limit of 3`);
  }
}
```

### 5.3 Agent communication envelope — `src/types/swarm/messages.ts`

> Exactly the schema you specified — `{ from, to, type, payload, timestamp }` — plus `id`, `runId`, and `correlationId` for tracing. Append-only.

```typescript
import { z } from 'zod';

/** Endpoint addresses. Sub-agents NEVER address each other directly except via the bus. */
export type Endpoint =
  | { kind: 'orchestrator' }
  | { kind: 'blackboard' }
  | { kind: 'agent'; agentId: AgentId };

export type MessageType =
  | 'task_assigned'      // orchestrator → agent
  | 'task_result'        // agent → orchestrator
  | 'task_error'         // agent → orchestrator
  | 'spawn_request'      // agent → orchestrator (request child)
  | 'spawn_granted'      // orchestrator → agent
  | 'spawn_denied'       // orchestrator → agent (depth/quota)
  | 'blackboard_write'   // agent → blackboard
  | 'blackboard_read'    // agent → blackboard
  | 'status_update'      // agent → orchestrator
  | 'cancel'             // orchestrator → agent
  | 'synthesize_request' // orchestrator → orchestrator (internal)
  | 'log';               // any → orchestrator (telemetry)

/** Payload is a discriminated union keyed by MessageType for full type-safety. */
export type MessagePayload =
  | { type: 'task_assigned';  taskId: TaskId; instruction: string; contextKeys: string[] }
  | { type: 'task_result';    taskId: TaskId; output: string; tokenUsage: TokenUsage }
  | { type: 'task_error';     taskId: TaskId; error: SwarmError }
  | { type: 'spawn_request';  parentTaskId: TaskId; childInstruction: string }
  | { type: 'spawn_granted';  childAgentId: AgentId; childTaskId: TaskId }
  | { type: 'spawn_denied';   reason: SwarmError }
  | { type: 'blackboard_write'; key: string; value: unknown; expectedVersion: number }
  | { type: 'blackboard_read';  key: string }
  | { type: 'status_update';  status: AgentStatus }
  | { type: 'cancel';         reason: string }
  | { type: 'synthesize_request'; resultKeys: string[] }
  | { type: 'log';            level: 'debug' | 'info' | 'warn' | 'error'; text: string };

export interface AgentMessage<P extends MessagePayload = MessagePayload> {
  readonly id: MessageId;
  readonly runId: RunId;
  readonly from: Endpoint;
  readonly to: Endpoint;
  readonly type: P['type'];
  readonly payload: P;
  readonly timestamp: number;       // epoch ms
  readonly correlationId: CorrelationId; // links request↔response
}

/** Zod schema for persistence/validation (payload narrowed per type at use site). */
export const AgentMessageSchema = z.object({
  id: MessageIdSchema,
  runId: RunIdSchema,
  from: z.unknown(),                // refined by Endpoint guard
  to: z.unknown(),
  type: z.string(),
  payload: z.unknown(),
  timestamp: z.number().int().nonnegative(),
  correlationId: z.string().uuid(),
});
```

### 5.4 Task graph (DAG) — `src/types/swarm/task-graph.ts`

```typescript
export type TaskStatus = 'pending' | 'ready' | 'running' | 'done' | 'failed' | 'skipped';
export type EdgeKind   = 'depends_on' | 'spawned';

export interface TaskNode {
  readonly id: TaskId;
  readonly runId: RunId;
  title: string;
  instruction: string;             // the actual prompt fragment for the sub-agent
  status: TaskStatus;
  depth: number;                   // 0 = root level, ≤ 3
  dependsOn: TaskId[];             // incoming edges (must be `done` to become `ready`)
  assignedAgentId: AgentId | null;
  suggestedSkillId: string | null; // hint from decomposer for the router
  result: string | null;
  error: SwarmError | null;
  tokenUsage: TokenUsage | null;   // reuse types/adapters.ts
  startedAt: number | null;
  finishedAt: number | null;
}

export interface TaskEdge {
  readonly from: TaskId;
  readonly to: TaskId;
  readonly kind: EdgeKind;
}

/** Class interface — implemented in src/swarm/task-graph.ts */
export interface ITaskGraph {
  readonly id: GraphId;
  readonly runId: RunId;
  addNode(node: TaskNode): void;
  /** Rejects edges that would introduce a cycle. */
  addEdge(edge: TaskEdge): Result<void, SwarmError>;
  getNode(id: TaskId): TaskNode | undefined;
  /** Nodes whose dependencies are all `done` and which are still `pending`. */
  getReadyNodes(): TaskNode[];
  /** Kahn topological order; Err on cycle. */
  topologicalOrder(): Result<TaskId[], SwarmError>;
  markStatus(id: TaskId, status: TaskStatus): void;
  isComplete(): boolean;           // all nodes done/failed/skipped
  toJSON(): SerializedGraph;       // for persistence + UI
}

export interface SerializedGraph {
  id: GraphId;
  runId: RunId;
  nodes: TaskNode[];
  edges: TaskEdge[];
}

/** Zod schema the LLM decomposer output is validated against. */
export const DecomposedPlanSchema = z.object({
  nodes: z.array(z.object({
    tempId: z.string(),            // decomposer-local id, mapped to TaskId on ingest
    title: z.string().min(1),
    instruction: z.string().min(1),
    dependsOn: z.array(z.string()),
    suggestedSkillId: z.string().nullable(),
  })).min(1).max(20),              // guard against runaway plans
});
export type DecomposedPlan = z.infer<typeof DecomposedPlanSchema>;
```

### 5.5 Agents — `src/types/swarm/agent.ts`

```typescript
export type AgentStatus =
  | 'idle' | 'thinking' | 'calling_tool' | 'awaiting_child'
  | 'done' | 'failed' | 'cancelled';

/** Immutable blueprint. Persona usually derived from an existing Skill. */
export interface AgentSpec {
  readonly id: AgentId;
  name: string;
  role: string;                    // e.g. "Research Specialist"
  systemPrompt: string;            // base persona (Skill.instructions can be merged in)
  skillId: string | null;          // → existing src/types/skills.ts Skill
  toolNames: string[];             // → src/engine/tool-executor.ts registry
  model: string;                   // ModelEntry.id
  provider: ProviderId;            // reuse types/models.ts
  parameters: InferenceParameters; // reuse types/parameters.ts
}

/** Live state. One per task. Owns an ISOLATED context window. */
export interface AgentRuntime {
  readonly spec: AgentSpec;
  readonly taskId: TaskId;
  readonly parentAgentId: AgentId | null;
  readonly depth: number;          // ≤ 3
  status: AgentStatus;
  /** Isolated context: this agent's OWN message list, never sibling's. */
  contextMessages: StreamMessage[];   // reuse src/adapters/types.ts
  tokenUsage: TokenUsage;
  childAgentIds: AgentId[];
  startedAt: number | null;
  finishedAt: number | null;
}

/** Class interface — implemented in src/swarm/sub-agent.ts */
export interface ISubAgent {
  readonly runtime: AgentRuntime;
  /** Runs the agent's task via the existing ProviderAdapter + resilience wrapper. */
  run(signal: AbortSignal): Promise<Result<AgentOutput, SwarmError>>;
  /** Spawns a child sub-agent; Err(MaxDepthError) if depth ≥ 3. Goes via orchestrator. */
  spawnChild(instruction: string): Promise<Result<AgentId, SwarmError>>;
  cancel(): void;
}

export interface AgentOutput {
  readonly taskId: TaskId;
  readonly agentId: AgentId;
  text: string;
  tokenUsage: TokenUsage;
  toolResults: ToolResult[];       // reuse types/messages.ts
  citations: WebSearchResult[];    // reuse types/messages.ts
}

export const MAX_AGENT_DEPTH = 3 as const;
```

### 5.6 Blackboard (optimistic locking) — `src/types/swarm/blackboard.ts`

```typescript
export interface BlackboardEntry<V = unknown> {
  readonly key: string;
  readonly runId: RunId;
  value: V;
  version: number;                 // monotonic; basis for CAS
  writerAgentId: AgentId | 'orchestrator';
  updatedAt: number;
}

/** Standard reserved keys (your spec: task_id, status, outputs, errors, timestamps). */
export type ReservedKey =
  | `task:${string}:status`
  | `task:${string}:output`
  | `task:${string}:error`
  | `task:${string}:timestamps`
  | `run:status`;

/** Class interface — implemented in src/swarm/blackboard.ts */
export interface IBlackboard {
  readonly runId: RunId;
  read<V>(key: string): BlackboardEntry<V> | undefined;
  /** Compare-and-swap: succeeds iff expectedVersion === current. Reuses _clock-style LWW. */
  write<V>(
    key: string,
    value: V,
    expectedVersion: number,
    writer: AgentId | 'orchestrator',
  ): Result<BlackboardEntry<V>, SwarmError>;   // Err(version_conflict) on mismatch
  /** Convenience: read-modify-write with bounded retries on conflict. */
  update<V>(
    key: string,
    fn: (current: V | undefined) => V,
    writer: AgentId | 'orchestrator',
    maxRetries?: number,
  ): Result<BlackboardEntry<V>, SwarmError>;
  keys(prefix?: string): string[];
  snapshot(): BlackboardEntry[];   // for UI + persistence
  subscribe(listener: (entry: BlackboardEntry) => void): () => void;
}
```

### 5.7 Memory layer — `src/types/swarm/memory.ts`

```typescript
export type MemoryScope = 'working' | 'episodic' | 'semantic';
export type MemoryKind  = 'fact' | 'result' | 'preference' | 'summary' | 'tool_output';

export interface MemoryRecord {
  readonly id: MemoryId;
  scope: MemoryScope;
  kind: MemoryKind;
  runId: RunId | null;             // null = cross-run (semantic/preference)
  agentId: AgentId | null;
  content: string;
  embedding: number[] | null;      // optional; lightweight local vector
  tags: string[];
  salience: number;                // 0..1, drives recall ranking + GC
  createdAt: number;
  lastAccessedAt: number;
}

export interface MemoryQuery {
  scope?: MemoryScope;
  runId?: RunId;
  tags?: string[];
  text?: string;                   // matched via retriever (keyword + optional cosine)
  limit?: number;                  // default 8
}

/** Class interface — implemented in src/swarm/memory/memory-store.ts */
export interface IMemoryStore {
  remember(input: Omit<MemoryRecord, 'id' | 'createdAt' | 'lastAccessedAt'>): Promise<Result<MemoryId, SwarmError>>;
  recall(query: MemoryQuery): Promise<Result<MemoryRecord[], SwarmError>>;
  /** Promote working memory → episodic so it survives run end. */
  promote(id: MemoryId, to: MemoryScope): Promise<Result<void, SwarmError>>;
  /** GC working memory for a finished run (unless promoted). */
  evictWorking(runId: RunId): Promise<void>;
}
```

### 5.8 Smart skill routing — `src/types/swarm/routing.ts`

```typescript
export interface RouteRequest {
  taskId: TaskId;
  instruction: string;
  suggestedSkillId: string | null; // hint from decomposer
  availableSkills: Skill[];        // reuse src/types/skills.ts (from skills-slice)
}

export interface RouteCandidate {
  skillId: string;
  role: string;
  score: number;                   // 0..1
  reasons: string[];
}

export interface RouteDecision {
  taskId: TaskId;
  chosenSkillId: string | null;    // null ⇒ generalist agent
  chosenRole: string;
  candidates: RouteCandidate[];
  strategy: 'heuristic' | 'llm' | 'hybrid';
  reasoning: string;
}

/** Class interface — implemented in src/swarm/routing/skill-router.ts */
export interface ISkillRouter {
  /** Fast keyword/tag/category heuristic (no LLM call). */
  routeHeuristic(req: RouteRequest): RouteDecision;
  /** Optional LLM-backed scorer for ambiguous tasks; reuses two-pass skill resolution. */
  routeLLM(req: RouteRequest, signal: AbortSignal): Promise<Result<RouteDecision, SwarmError>>;
  /** Hybrid: heuristic first, escalate to LLM only when top-2 scores are close. */
  route(req: RouteRequest, signal: AbortSignal): Promise<Result<RouteDecision, SwarmError>>;
}
```

### 5.9 Run aggregate + Orchestrator — `src/types/swarm/run.ts` + `src/swarm/orchestrator.ts`

```typescript
export type RunStatus =
  | 'queued' | 'planning' | 'running' | 'synthesizing'
  | 'done' | 'failed' | 'aborted';

export interface CostRollup {
  tokenCounts: TokenCounts;        // reuse types/messages.ts
  costEstimate: CostEstimate;      // reuse types/messages.ts
  perAgent: Record<string, TokenCounts>;
}

export interface SwarmRun {
  readonly id: RunId;
  readonly graphId: GraphId;
  rootTask: string;                // original user task
  status: RunStatus;
  finalAnswer: string | null;
  cost: CostRollup;
  createdAt: number;
  finishedAt: number | null;
  error: SwarmError | null;
}

/** Event stream the UI subscribes to (mirrors NormalizedStreamEvent ergonomics). */
export type RunEvent =
  | { type: 'run_status';   status: RunStatus }
  | { type: 'graph_built';  graph: SerializedGraph }
  | { type: 'node_status';  taskId: TaskId; status: TaskStatus }
  | { type: 'agent_status'; agentId: AgentId; status: AgentStatus }
  | { type: 'message';      message: AgentMessage }
  | { type: 'blackboard';   entry: BlackboardEntry }
  | { type: 'final';        answer: string; cost: CostRollup }
  | { type: 'error';        error: SwarmError };

export interface OrchestratorConfig {
  maxConcurrency: number;          // bounded async pool size (default 4)
  maxDepth: 3;
  decomposeModel: { provider: ProviderId; model: string };
  synthesizeModel: { provider: ProviderId; model: string };
  routingStrategy: 'heuristic' | 'llm' | 'hybrid';
}

/** Class interface — implemented in src/swarm/orchestrator.ts */
export interface IOrchestrator {
  /** Full pipeline: decompose → schedule → collect → synthesize. */
  run(task: string, signal: AbortSignal): AsyncGenerator<RunEvent, Result<SwarmRun, SwarmError>>;
  abort(): void;
  getRun(): SwarmRun;
}

/** Bounded async pool (bulkhead) — src/swarm/agent-pool.ts */
export interface IAgentPool {
  readonly size: number;
  /** Resolves when a slot is free; runs fn under a CircuitBreaker (reuse resilience.ts). */
  submit<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T>;
  drain(): Promise<void>;          // await all in-flight
  abortAll(): void;
}
```

### 5.10 Store slice shapes — `src/store/{swarm,blackboard,memory}-slice.ts`

```typescript
export interface SwarmSlice {
  runs: Record<string, SwarmRun>;
  activeRunId: RunId | null;
  graphs: Record<string, SerializedGraph>;
  agents: Record<string, AgentRuntime>;
  messages: AgentMessage[];        // capped ring buffer for UI
  swarmPanelOpen: boolean;

  startRun: (task: string) => Promise<void>;
  abortRun: (runId: RunId) => void;
  applyRunEvent: (e: RunEvent) => void;   // single reducer for the event stream
  setSwarmPanelOpen: (open: boolean) => void;
  // selectors
  getActiveRun: () => SwarmRun | null;
  getReadyTaskCount: () => number;
}

export interface BlackboardSlice {
  entries: Record<string, BlackboardEntry>;   // keyed by `${runId}:${key}`
  upsertEntry: (e: BlackboardEntry) => void;
  getEntry: (runId: RunId, key: string) => BlackboardEntry | undefined;
}

export interface MemorySlice {
  records: Record<string, MemoryRecord>;
  rememberLocal: (r: MemoryRecord) => void;
  recallLocal: (q: MemoryQuery) => MemoryRecord[];
}
```

### 5.11 Persistence schema additions — `src/db/schema.ts` (DB_VERSION bump)

```typescript
// New object stores (additive — safe migration per database-design skill):
//   swarm_runs        keyPath 'id'         index by-status, by-createdAt
//   blackboard_entries keyPath ['runId','key']  index by-runId
//   agent_messages    keyPath 'id'         index by-runId, by-timestamp
//   memory_records    keyPath 'id'         index by-scope, by-runId, by-tags(multiEntry)
```


---

## 6. Slice Plan (planning-and-task-breakdown skill)

**Plan outcome (one sentence):** *By the end of this work, a user can type one complex task into the chat and watch a swarm of specialist agents decompose it into a DAG, run in parallel with isolated context, coordinate only through a locked blackboard, recall relevant memory, and return one synthesized answer — all client-side.*

Sizes: **XS** ≤ ½ day · **S** ~1 day · **M** 2–3 days · **L** ~1 week (warning) · **XL** must split.

| ID | Outcome | Acceptance | Size | Depends on | Out of scope |
|----|---------|------------|------|------------|--------------|
| **S01** | Type foundation compiles — all swarm types, branded IDs, Zod schemas, `Result`, `SwarmError` exist and `tsc` is green. | `src/types/swarm/*` compiles; `assertNever` & brands enforce at type level; a throwaway `*.spec-types.ts` proves ID mix-ups fail to compile. | **S** | — | runtime behavior |
| **S02** | **Dumb wire**: orchestrator runs a *trivial* 1-node graph end-to-end (no real LLM) and emits `RunEvent`s the store renders. | `startRun("hi")` produces `run_status→graph_built→node_status→final`; UI shows a single node going `ready→done`. | **S** | S01 | real decomposition |
| **S03** | TaskGraph DAG is real: build, add edges, reject cycles, topo-sort, `getReadyNodes`. | Unit tests: cycle rejected with `cycle_detected`; topo order correct; ready set correct as nodes complete. | **M** | S01 | scheduling |
| **S04** | Blackboard with optimistic locking works. | CAS write succeeds on matching version, returns `version_conflict` otherwise; `update()` retries; concurrent-write test proves no lost update. | **S** | S01 | persistence |
| **S05** | SubAgent runs a real task via existing `ProviderAdapter` + `CircuitBreaker`, with isolated context. | One agent streams a real model answer; its `contextMessages` contain only its own task; tokens recorded; abort works. | **M** | S01, S04 | spawning, pool |
| **S06** | AgentPool (bounded concurrency / bulkhead) + parallel scheduling of ready nodes. | N ready nodes run with ≤ `maxConcurrency` in flight; `drain()` awaits all; `abortAll()` cancels. | **M** | S03, S05 | recursion |
| **S07** | LLM Decomposer: task → validated `DecomposedPlan` → real `TaskGraph`. | Bad LLM JSON → `invalid_llm_output` (no crash); valid plan builds an acyclic graph; capped at 20 nodes. | **M** | S03, S05 | synthesis |
| **S08** | Synthesizer: collect blackboard results → final answer via LLM. | Final answer references sub-results; cost rollup aggregates per-agent usage. | **S** | S04, S07 | — |
| **S09** | Recursive spawning with depth cap. | `spawnChild` at depth<3 creates child via orchestrator; depth≥3 → `max_depth`; child results bubble up. | **M** | S06, S07 | cross-run memory |
| **S10** | Message bus + append-only comms log; enforce no A↔A. | All comms are `AgentMessage`; bus routes via orchestrator; `madge` shows no agent↔agent cycle. | **S** | S05, S06 | — |
| **S11** | Memory layer: working + episodic, persisted; recall injected into agent context. | `remember`/`recall` round-trip through IndexedDB; working GC'd at run end unless promoted; recalled facts appear in an agent's context. | **M** | S01, S05 | embeddings server |
| **S12** | Smart skill router: heuristic + hybrid LLM escalation, picks personas from existing Skill library. | Clear task → heuristic skill; ambiguous → LLM escalation; `no_route` falls back to generalist. | **M** | S05, S07 | new skills |
| **S13** | Persistence: bump `DB_VERSION`, add 4 stores + repos; runs reload after refresh. | Refresh mid/after run restores run, graph, blackboard, messages; additive migration is reversible-safe. | **M** | S02, S04, S07, S11 | cloud sync |
| **S14** | UI enhancement: `SwarmPanel` with `TaskGraphView`, `AgentCard`s, `BlackboardView`, `MessageLogView`, `RunControls`. | Live DAG with status colors; per-agent spinner/tokens; blackboard inspector; comms timeline; start/abort/retry. | **L → split** | S02, S06, S10 | analytics dashboards |
| **S15** | Verification & hardening sweep. | `tsc --noEmit`, `eslint --max-warnings=0`, `madge --circular`, vitest all green; chaos tests (abort mid-fan-out, provider 429, IDB quota). | **S** | all | — |

### Dependency graph (DAG)

```
S01 ─┬─ S02 ───────────────┬───────── S13
     ├─ S03 ─┬─ S06 ─┬─ S09 │
     │       │       └──────┤
     ├─ S04 ─┘              │
     ├─ S05 ─┬─ S06         ├─ S14 ── S15
     │       ├─ S10         │
     │       ├─ S11 ────────┤
     │       └─ S12         │
     └─ S07 ─┬─ S08 ────────┘
             ├─ S09
             └─ S12
```

### First slice = **S01** (ready to execute)

- **Outcome:** the entire type foundation in `src/types/swarm/` compiles under strict mode.
- **Why first:** no unmet deps; highest learning value (locks every contract; surfaces design errors at compile time before any runtime cost); tiny and reviewable in one sitting.
- **Acceptance:** `tsc --noEmit` green; a `*.type-test.ts` proves `RunId`/`TaskId` are not interchangeable and `assertNever` catches a missing union branch.
- **Out of scope:** any runtime behavior — S01 ships types only.

### S14 split (no XL/L left)

- **S14a** (S): `SwarmPanel` shell + `RunControls` + store wiring (start/abort).
- **S14b** (M): `TaskGraphView` (DAG layout + status colors) + `AgentCard`s.
- **S14c** (S): `BlackboardView` + `MessageLogView`.

### Replan triggers

- Decomposer produces unusable plans > 30% of the time → revisit S07 prompt/schema before proceeding.
- A slice runs 3× its size estimate → recalibrate sizes.
- User changes the outcome (e.g., wants server-side execution) → redraw from §1, don't patch.

---

## 7. Memory Layer (deep dive)

Three scopes, one store facade (`IMemoryStore`), persisted in IndexedDB.

| Scope | Lifetime | Use | Persistence |
|-------|----------|-----|-------------|
| **working** | one run | per-run scratch: intermediate results, sub-agent notes | `memory_records` w/ `scope='working'`, GC'd at run end unless promoted |
| **episodic** | cross-run | "what happened in past runs" — prior tasks, outcomes, errors | persisted; recalled by tag/text |
| **semantic** | durable | user preferences, learned facts, reusable knowledge | persisted; highest salience survives |

**Recall pipeline (`retriever.ts`):**
1. Filter by `scope`/`runId`/`tags`.
2. Score: keyword overlap (BM25-lite) + optional cosine similarity if `embedding` present.
3. Rank by `score × salience × recencyDecay`, take `limit` (default 8).
4. Bump `lastAccessedAt`; salience decays over time, reinforced on access.

**Embeddings:** optional and **local-first**. If the active provider exposes an embeddings endpoint via an adapter, use it; otherwise fall back to keyword recall. No external vector DB (client-only constraint).

**Injection:** before a sub-agent runs, the orchestrator calls `recall({ runId, text: instruction })` and prepends the top records as a `system`/`assistant` context block (built through `context-engine.buildContextWindow`, so it respects the agent's token budget).

---

## 8. Smart Skill Routing (deep dive)

Reuses the **existing** `Skill` library (`src/types/skills.ts`, `skills-slice`, `built-in-skills.ts`). No new skill model.

**Scoring (`scorer.ts`), heuristic pass (no LLM cost):**
- `+0.5` if `suggestedSkillId` matches a skill (decomposer hint).
- `+0.3 × tagOverlap(instruction, skill.tags)`.
- `+0.2` if instruction keywords hit `skill.category`.
- Normalize to `0..1`.

**Hybrid escalation:** if top-2 candidate scores differ by `< 0.15` (ambiguous), call `routeLLM` — which reuses the **two-pass** skill-resolution prompt already in `skill-injector.ts` (`buildSkillCatalogBlock`) and validates the JSON (`{ selectedIds, reasoning, noSkillsNeeded }`) with Zod.

**Persona assembly:** chosen `Skill.instructions` are merged into the `AgentSpec.systemPrompt` (the swarm-specific framing + the skill body), and `Skill.tags`/`category` inform `toolNames`. `no_route` ⇒ generalist agent with the run's default system prompt.

---

## 9. UI Enhancement (deep dive)

A new **Swarm** surface, consistent with the app's glassmorphism shadcn-ui style.

| Component | Shows | Reuses |
|-----------|-------|--------|
| `SwarmPanel` | drawer/route container; tabs: Graph · Blackboard · Messages | existing `Drawer`/`Tabs`/`ScrollArea` primitives |
| `TaskGraphView` | DAG with nodes colored by `TaskStatus`; edges = deps; live updates | `framer-motion` (already a dep) for transitions |
| `AgentCard` | name, role, skill badge, status spinner, live token count, depth indent | existing `Card`/`Badge`, `SkillUsageBadge` pattern |
| `BlackboardView` | KV table: key, value preview, version, writer, updatedAt | `Table`/`Tooltip` |
| `MessageLogView` | append-only timeline of `AgentMessage`s (from→to, type, ts) | virtualized list |
| `RunControls` | start, abort, retry-failed-node; cost rollup readout | `Button`, existing cost formatter |

**Entry point:** a "Swarm mode" toggle in the chat composer routes the message to `swarmSlice.startRun(task)` instead of single-model inference; the panel opens automatically and streams `RunEvent`s through `applyRunEvent`.

---

## 10. Parallel-Agent Dispatch Strategy (dispatching-parallel-agents skill)

Two layers of parallelism, both bounded:

1. **Runtime (the product):** the `AgentPool` is the embodiment of the skill's principle — *one agent per independent task domain, run concurrently, isolated context, no shared mutable state except the locked blackboard*. Ready DAG nodes with no shared dependency are dispatched together up to `maxConcurrency`; each runs under its own `CircuitBreaker` (bulkhead isolation). This is exactly "dispatch one agent per independent problem domain; let them work concurrently."

2. **Build time (how we implement this plan):** independent slices (e.g., **S03 TaskGraph**, **S04 Blackboard**, **S11 Memory**, **S12 Routing**) touch disjoint files and can be implemented by parallel sub-agents with focused scope and explicit "do not touch other modules" constraints, then integrated and verified together (S15). Related slices (S05→S06→S09 chain) stay sequential because they share state.

**Isolation guarantees in code:**
- Each `AgentRuntime.contextMessages` is constructed fresh — never a reference to a sibling's array.
- Sub-agents receive only `contextKeys` (blackboard keys) they're allowed to read, not the whole board.
- `AbortSignal` is threaded from `Orchestrator.run` → `AgentPool.submit` → `adapter.stream`, so abort is clean and immediate.

---

## 11. Verification, Persistence Migration, Risks & Non-Goals

### 11.1 Self-verification (typescript-pro Phase 5) — run every slice

```bash
npx tsc --noEmit                 # zero errors
npx eslint . --max-warnings=0    # clean
npx madge --circular src/        # no cycles (esp. no agent↔agent)
npx vitest run                   # green; add tests where missing
```

**Chaos tests (S15):** abort mid-fan-out; provider `429`/`rate_limit`; IndexedDB quota exhaustion; concurrent blackboard writes (CAS contention); decomposer returns malformed JSON; spawn attempted at depth 3.

### 11.2 Persistence migration (database-design skill)

All additions are **additive** (new object stores) → safe, backward-compatible per the expand-contract rule. Steps:
1. Bump `DB_VERSION` in `src/db/schema.ts`.
2. In `connection.ts` `upgrade()`, create `swarm_runs`, `blackboard_entries`, `agent_messages`, `memory_records` with the indexes in §5.11 (guarded by `if (!db.objectStoreNames.contains(...))`).
3. New repos (`swarm-repo.ts`, `blackboard-repo.ts`, `memory-repo.ts`) mirror existing repo patterns (`messages-repo.ts`).
4. No existing store is altered → existing data untouched, migration reversible by version.

Indexing rationale: `agent_messages.by-runId` + `by-timestamp` for the timeline; `memory_records.by-tags` is `multiEntry` for tag recall; `blackboard_entries` keyed by composite `['runId','key']` for O(1) CAS lookup.

### 11.3 Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Runaway recursion / cost blow-up | hard `MAX_AGENT_DEPTH=3`, node cap (≤20), `maxConcurrency`, per-run cost budget that aborts the run |
| Decomposer emits invalid/cyclic plans | Zod validation + `TaskGraph.addEdge` cycle rejection → `invalid_llm_output`/`cycle_detected`, never a crash |
| Lost updates on shared state | optimistic CAS on `version`; `update()` bounded retry; concurrency unit test |
| Provider outage during fan-out | reuse `CircuitBreaker` per provider; failed node → `failed`, run can still synthesize partial results |
| Context leakage between agents | fresh `contextMessages` per agent; only whitelisted blackboard keys passed in |
| IndexedDB quota / corruption | reuse existing `isDBCorrupted`/`resetDBConnection`; memory GC; cap `messages` ring buffer in store |
| UI overwhelmed by event volume | capped ring buffer + virtualized lists + batched `applyRunEvent` |

### 11.4 Non-goals (explicit out-of-scope)

- Server-side / sandboxed code or shell execution (agents reason + use existing tools only).
- Multi-user real-time collaboration on a shared swarm.
- A hosted vector database (recall is local; embeddings optional).
- Changes to billing or the BYOK vault model.
- New LLM providers or transport layers (reuse the adapter registry as-is).

---

## 12. Decision Log (summary)

```
PLAN: Add a client-side agent-swarm (orchestrator + sub-agent pool + blackboard)
      plus memory, smart skill routing, and UI to the BYOK chat app.
KEY DECISIONS:
  - Orchestration layer ON TOP of existing adapters/resilience/context/skills —
    no parallel stack, no new transport.
  - Types-first: branded IDs, Zod at boundaries, Result types, discriminated unions.
  - DAG with cycle rejection; blackboard with optimistic CAS (reuses _clock LWW idea).
  - Bounded AgentPool = bulkhead; CircuitBreaker per provider; AbortSignal threaded.
  - Memory = working/episodic/semantic in IndexedDB; recall via keyword(+optional cosine).
  - Skill router reuses existing Skill library; heuristic→LLM hybrid escalation.
  - Persistence additive only (DB_VERSION bump, 4 new stores).
FIRST SLICE: S01 (type foundation) — ready to execute.
REPLAN TRIGGERS: bad decompositions >30%, slice 3× over size, outcome change.
```

> **Next action after approval:** execute **S01** (types only) under `incremental-implementation`, run the Phase-5 verification loop, commit, and open the PR. No application code is written until S01 begins.

---

## 13. Implementation Status (audit — 2026-06-14)

**Answer: NO — the full swarm is _not_ completely implemented.** The core execution engine (decompose → DAG → parallel run → synthesize) is real, type-safe, and tested, but three planned subsystems (**memory**, **smart skill routing**, **persistence**) are scaffolded yet **not wired into the orchestrator**, recursive spawning is stubbed, and the UI is a single panel with **no entry point**.

### Slice-by-slice status

| ID | Slice | Status | Notes |
|----|-------|--------|-------|
| S01 | Type foundation | ✅ Done | `src/types/swarm/*` + `__type-tests__.ts`; `tsc --noEmit` green. |
| S02 | Dumb wire (orchestrator → RunEvents → store) | ✅ Done | `orchestrator.ts` + `swarm-slice.ts` + `SwarmPanel`. |
| S03 | TaskGraph DAG (cycle reject, topo, ready set) | ✅ Done | Covered by `swarm-core.test.ts`. |
| S04 | Blackboard optimistic CAS | ✅ Done | CAS + retry tests pass. |
| S05 | SubAgent (isolated context, abort) | ✅ Done | Real LLM via adapter registry; fresh context per agent. |
| S06 | AgentPool (bounded concurrency) | ✅ Done | Concurrency + `abortAll` tests pass. |
| S07 | LLM Decomposer (Zod-validated → graph) | ✅ Done | Malformed JSON → `invalid_llm_output`; cycle-safe; node cap. |
| S08 | Synthesizer | ✅ Done | Collects blackboard outputs → final answer; cost rollup. |
| S09 | Recursive spawning w/ depth cap | ⚠️ Partial | `SubAgent.spawnChild` enforces `MAX_AGENT_DEPTH`, **but** the orchestrator's `spawnHook` is hardwired to return `max_depth`, so children are never actually created through the orchestrator. Depth cap proven; real recursion not delivered. |
| S10 | Message bus + append-only log (no A↔A) | ⚠️ Partial | Bus + immutable log exist and are populated; **but** the store only syncs `messages` once at run **end** (no live timeline), and the `madge --circular` gate has not been run/recorded. |
| S11 | Memory (working/episodic, recall injection) | ❌ Not wired | `MemoryStore`, `retriever`, `memory-repo` exist, **but** the orchestrator never calls `recall`/`remember` and nothing is injected into sub-agent context. No round-trip in use. |
| S12 | Smart skill router (heuristic→LLM hybrid) | ❌ Not wired | `SkillRouter` + `scorer` implemented, **but** the orchestrator assigns a fixed generic persona and never invokes routing. `suggestedSkillId` from the decomposer is stored but unused for persona assembly. |
| S13 | Persistence (DB v2 + repos, reload after refresh) | ❌ Not wired | `DB_VERSION = 2` and the four object stores + `swarm-repo.ts` exist, **but** no run / blackboard / message / memory is ever persisted or rehydrated. A refresh loses the run. (`blackboard-repo.ts` from the plan was folded into `swarm-repo`/not created.) |
| S14 | UI (Graph/Agent/Blackboard/Message/Controls) | ⚠️ Partial | `SwarmPanel` renders the graph, node results, final answer, and a token total. **Missing:** dedicated `TaskGraphView`, `AgentCard`, `BlackboardView`, `MessageLogView`, `RunControls`, and — critically — **any UI affordance to open the panel** (`panelOpen` is never toggled from the chat composer/header). The feature is effectively unreachable by an end user today. |
| S15 | Verification & hardening | ⚠️ Partial | `tsc --noEmit` and `vitest run` are green (48 tests). **Missing:** the chaos tests (abort mid-fan-out, provider 429, IDB quota, depth-3 spawn), plus recorded `eslint --max-warnings=0` and `madge --circular` runs. |

### What remains (ordered by user impact)

1. **S14 entry point (blocker).** Add a "Swarm" toggle/button in the chat composer or header that calls `setSwarmPanelOpen(true)` (and ideally routes a composer message to `startSwarmRun`). Without this the swarm cannot be launched from the UI.
2. **S12 routing wiring.** Have the orchestrator call `SkillRouter.route()` per node and merge the chosen `Skill.instructions` into each `AgentSpec.systemPrompt` (use `node.suggestedSkillId` as the hint).
3. **S11 memory wiring.** Call `memoryStore.recall()` before each sub-agent runs and prepend results to its context; `remember()` notable outputs; `evictWorking()` at run end.
4. **S13 persistence wiring.** Persist run/graph/blackboard/messages via `swarm-repo`/`memory-repo` and rehydrate on load so a refresh restores an in-flight or finished run.
5. **S09 real recursion.** Replace the stub `spawnHook` with one that creates a child node/agent through the orchestrator (respecting depth ≤ 3) and bubbles results to the blackboard.
6. **S10 live messages + S14 sub-views.** Stream `message` RunEvents live and build `MessageLogView`/`BlackboardView`/`AgentCard`/`TaskGraphView`/`RunControls`.
7. **S15 hardening.** Add chaos tests and wire `eslint --max-warnings=0` + `madge --circular` into the verification loop.

**One-line verdict:** the swarm's *brain* (planning, parallel execution, synthesis) works end-to-end and is well-tested; its *senses and memory* (routing, memory, persistence), its *recursion*, and most of its *face* (UI surfaces + an entry point) are still to be connected.

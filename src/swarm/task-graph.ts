/**
 * TaskGraph — DAG with cycle detection, topo-sort, ready-node computation.
 * Pure data structure; no I/O.
 */
import type { ITaskGraph, TaskNode, TaskEdge, SerializedGraph, TaskStatus } from '../types/swarm/task-graph';
import type { GraphId, RunId, TaskId, Result } from '../types/swarm/ids';
import { Ok, Err } from '../types/swarm/ids';
import type { SwarmError } from '../types/swarm/errors';

export class TaskGraph implements ITaskGraph {
  readonly id: GraphId;
  readonly runId: RunId;
  private readonly nodes = new Map<TaskId, TaskNode>();
  private readonly edges: TaskEdge[] = [];
  /** Adjacency: parent → children (forward edges). */
  private readonly forward = new Map<TaskId, Set<TaskId>>();
  /** Reverse adjacency: child → parents. */
  private readonly reverse = new Map<TaskId, Set<TaskId>>();

  constructor(id: GraphId, runId: RunId) {
    this.id = id;
    this.runId = runId;
  }

  addNode(node: TaskNode): void {
    this.nodes.set(node.id, node);
    if (!this.forward.has(node.id)) this.forward.set(node.id, new Set());
    if (!this.reverse.has(node.id)) this.reverse.set(node.id, new Set());
  }

  addEdge(edge: TaskEdge): Result<void, SwarmError> {
    if (!this.nodes.has(edge.from) || !this.nodes.has(edge.to)) {
      return Err({ kind: 'node_not_found', taskId: this.nodes.has(edge.from) ? edge.to : edge.from });
    }
    if (edge.from === edge.to) {
      return Err({ kind: 'cycle_detected', from: edge.from, to: edge.to });
    }
    if (this.wouldCreateCycle(edge.from, edge.to)) {
      return Err({ kind: 'cycle_detected', from: edge.from, to: edge.to });
    }
    this.forward.get(edge.from)!.add(edge.to);
    this.reverse.get(edge.to)!.add(edge.from);
    this.edges.push(edge);
    if (edge.kind === 'depends_on') {
      const target = this.nodes.get(edge.to)!;
      if (!target.dependsOn.includes(edge.from)) {
        target.dependsOn = [...target.dependsOn, edge.from];
      }
    }
    return Ok(undefined);
  }

  /** Does adding `from → to` create a back-edge? DFS from `to` looking for `from`. */
  private wouldCreateCycle(from: TaskId, to: TaskId): boolean {
    const stack: TaskId[] = [to];
    const seen = new Set<TaskId>();
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (cur === from) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const children = this.forward.get(cur);
      if (children) for (const c of children) stack.push(c);
    }
    return false;
  }

  getNode(id: TaskId): TaskNode | undefined {
    return this.nodes.get(id);
  }

  getAllNodes(): TaskNode[] {
    return Array.from(this.nodes.values());
  }

  getReadyNodes(): TaskNode[] {
    const out: TaskNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.status !== 'pending') continue;
      let allDone = true;
      for (const parentId of node.dependsOn) {
        const parent = this.nodes.get(parentId);
        if (!parent || parent.status !== 'done') { allDone = false; break; }
      }
      if (allDone) out.push(node);
    }
    return out;
  }

  topologicalOrder(): Result<TaskId[], SwarmError> {
    const dependencyChildren = new Map<TaskId, TaskId[]>();
    const inDegree = new Map<TaskId, number>();

    for (const node of this.nodes.values()) {
      inDegree.set(node.id, node.dependsOn.length);
      dependencyChildren.set(node.id, []);
    }

    for (const edge of this.edges) {
      if (edge.kind !== 'depends_on') continue;
      dependencyChildren.get(edge.from)?.push(edge.to);
    }

    const queue: TaskId[] = [];
    for (const [id, deg] of inDegree) if (deg === 0) queue.push(id);

    const out: TaskId[] = [];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      out.push(cur);
      for (const child of dependencyChildren.get(cur) ?? []) {
        const d = (inDegree.get(child) ?? 0) - 1;
        inDegree.set(child, d);
        if (d === 0) queue.push(child);
      }
    }

    if (out.length !== this.nodes.size) {
      const offending = Array.from(this.nodes.values()).find((node) => (inDegree.get(node.id) ?? 0) > 0);
      const parent = offending?.dependsOn[0] ?? offending?.id;
      return Err({ kind: 'cycle_detected', from: parent as TaskId, to: offending!.id });
    }

    return Ok(out);
  }

  markStatus(id: TaskId, status: TaskStatus): void {
    const n = this.nodes.get(id);
    if (!n) return;
    n.status = status;
    const now = Date.now();
    if (status === 'running' && n.startedAt === null) n.startedAt = now;
    if ((status === 'done' || status === 'failed' || status === 'skipped') && n.finishedAt === null) {
      n.finishedAt = now;
    }
  }

  updateNode(id: TaskId, patch: Partial<TaskNode>): void {
    const n = this.nodes.get(id);
    if (!n) return;
    Object.assign(n, patch);
  }

  isComplete(): boolean {
    for (const n of this.nodes.values()) {
      if (n.status !== 'done' && n.status !== 'failed' && n.status !== 'skipped') return false;
    }
    return true;
  }

  /** Compute topological layer (longest path from any root) for each node. Useful for UI layout. */
  topologicalLayers(): Map<TaskId, number> {
    const layers = new Map<TaskId, number>();
    const topo = this.topologicalOrder();
    if (!topo.ok) return layers;
    for (const id of topo.value) {
      const parents = this.reverse.get(id) ?? new Set();
      let depth = 0;
      for (const p of parents) depth = Math.max(depth, (layers.get(p) ?? 0) + 1);
      layers.set(id, depth);
    }
    return layers;
  }

  toJSON(): SerializedGraph {
    return {
      id: this.id,
      runId: this.runId,
      nodes: this.getAllNodes().map((n) => ({ ...n, dependsOn: [...n.dependsOn] })),
      edges: this.edges.map((e) => ({ ...e })),
    };
  }

  static fromJSON(serialized: SerializedGraph): TaskGraph {
    const g = new TaskGraph(serialized.id, serialized.runId);
    for (const n of serialized.nodes) g.addNode({ ...n, dependsOn: [...n.dependsOn] });
    for (const e of serialized.edges) {
      // Skip cycle check on rehydrate — graph was previously valid.
      g.forward.get(e.from)!.add(e.to);
      g.reverse.get(e.to)!.add(e.from);
      g.edges.push({ ...e });
    }
    return g;
  }
}

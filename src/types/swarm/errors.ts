import type { ClassifiedError } from '../adapters';
import type { TaskId, AgentId, RunId } from './ids';

export type SwarmError =
  | { kind: 'decompose_failed'; message: string; raw?: unknown }
  | { kind: 'invalid_llm_output'; message: string; zodIssues: unknown }
  | { kind: 'cycle_detected'; from: TaskId; to: TaskId }
  | { kind: 'max_depth'; depth: number; limit: 3 }
  | { kind: 'version_conflict'; key: string; expected: number; actual: number }
  | { kind: 'agent_failed'; agentId: AgentId; taskId: TaskId; cause: string }
  | { kind: 'aborted'; runId: RunId }
  | { kind: 'provider_error'; classified: ClassifiedError }
  | { kind: 'memory_error'; message: string }
  | { kind: 'no_route'; taskId: TaskId; message: string }
  | { kind: 'persistence_error'; message: string }
  | { kind: 'node_not_found'; taskId: TaskId }
  | { kind: 'internal'; message: string };

export class MaxDepthError extends Error {
  readonly kind = 'max_depth' as const;
  readonly limit = 3 as const;
  constructor(public readonly depth: number) {
    super(`Sub-agent spawn depth ${depth} exceeds limit of 3`);
  }
}

export function formatSwarmError(e: SwarmError): string {
  switch (e.kind) {
    case 'decompose_failed': return `Decomposition failed: ${e.message}`;
    case 'invalid_llm_output': return `Invalid LLM output: ${e.message}`;
    case 'cycle_detected': return `Cycle detected ${e.from}→${e.to}`;
    case 'max_depth': return `Max spawn depth ${e.limit} exceeded (was ${e.depth})`;
    case 'version_conflict': return `Blackboard conflict on "${e.key}" (expected v${e.expected}, got v${e.actual})`;
    case 'agent_failed': return `Agent ${e.agentId} failed task ${e.taskId}: ${e.cause}`;
    case 'aborted': return `Run ${e.runId} aborted`;
    case 'provider_error': return `Provider error: ${e.classified.message}`;
    case 'memory_error': return `Memory error: ${e.message}`;
    case 'no_route': return `No route for task ${e.taskId}: ${e.message}`;
    case 'persistence_error': return `Persistence error: ${e.message}`;
    case 'node_not_found': return `Task node not found: ${e.taskId}`;
    case 'internal': return `Internal error: ${e.message}`;
  }
}

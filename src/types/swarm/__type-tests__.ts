/**
 * Compile-time type tests for S01.
 * If these ever start compiling, the branded-ID safety has regressed.
 *
 * To verify manually: uncomment a block below; tsc should error.
 */
import {
  newRunId, newTaskId, newAgentId, assertNever,
  type RunId, type TaskId,
} from './ids';
import type { SwarmError } from './errors';

// ─── Branded IDs are not interchangeable ──────────────────────
const r: RunId = newRunId();
const t: TaskId = newTaskId();

function takesRunId(_id: RunId): void { /* noop */ }
function takesTaskId(_id: TaskId): void { /* noop */ }

takesRunId(r);
takesTaskId(t);

// @ts-expect-error — RunId is not assignable to TaskId
takesTaskId(r);
// @ts-expect-error — TaskId is not assignable to RunId
takesRunId(t);
// @ts-expect-error — raw string is not assignable to branded ID
takesRunId('not-an-id');

// ─── assertNever catches missing union branches ───────────────
function handle(e: SwarmError): string {
  switch (e.kind) {
    case 'decompose_failed':
    case 'invalid_llm_output':
    case 'cycle_detected':
    case 'max_depth':
    case 'version_conflict':
    case 'agent_failed':
    case 'aborted':
    case 'provider_error':
    case 'memory_error':
    case 'no_route':
    case 'persistence_error':
    case 'node_not_found':
    case 'internal':
      return e.kind;
    default:
      return assertNever(e);
  }
}

export const __TYPE_TESTS__ = { handle, _: newAgentId() };

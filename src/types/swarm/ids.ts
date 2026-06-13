/**
 * Branded IDs, Result type, assertNever.
 * Every swarm ID is nominally typed so e.g. RunId cannot be passed where TaskId is expected.
 */
import { z } from 'zod';
import { uuidv7 } from '../../lib/uuid';

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type RunId = Brand<string, 'RunId'>;
export type GraphId = Brand<string, 'GraphId'>;
export type TaskId = Brand<string, 'TaskId'>;
export type AgentId = Brand<string, 'AgentId'>;
export type MessageId = Brand<string, 'MessageId'>;
export type MemoryId = Brand<string, 'MemoryId'>;
export type CorrelationId = Brand<string, 'CorrelationId'>;

// Zod brand schemas — uuidv7 isn't strictly RFC4122 v4, so allow any non-empty string.
const idBase = z.string().min(1);
export const RunIdSchema = idBase.brand<'RunId'>();
export const GraphIdSchema = idBase.brand<'GraphId'>();
export const TaskIdSchema = idBase.brand<'TaskId'>();
export const AgentIdSchema = idBase.brand<'AgentId'>();
export const MessageIdSchema = idBase.brand<'MessageId'>();
export const MemoryIdSchema = idBase.brand<'MemoryId'>();
export const CorrelationIdSchema = idBase.brand<'CorrelationId'>();

export const newRunId = (): RunId => uuidv7() as RunId;
export const newGraphId = (): GraphId => uuidv7() as GraphId;
export const newTaskId = (): TaskId => uuidv7() as TaskId;
export const newAgentId = (): AgentId => uuidv7() as AgentId;
export const newMessageId = (): MessageId => uuidv7() as MessageId;
export const newMemoryId = (): MemoryId => uuidv7() as MemoryId;
export const newCorrelationId = (): CorrelationId => uuidv7() as CorrelationId;

/** Cast helpers for persistence boundaries (after Zod validation). */
export const asRunId = (s: string): RunId => s as RunId;
export const asGraphId = (s: string): GraphId => s as GraphId;
export const asTaskId = (s: string): TaskId => s as TaskId;
export const asAgentId = (s: string): AgentId => s as AgentId;
export const asMessageId = (s: string): MessageId => s as MessageId;
export const asMemoryId = (s: string): MemoryId => s as MemoryId;
export const asCorrelationId = (s: string): CorrelationId => s as CorrelationId;

// ─── Result ────────────────────────────────────────────────────
// `value` / `error` are present on both variants (typed `undefined` on the
// non-matching side) so callers can read either property without depending on
// cross-module discriminated-union narrowing, which is fragile under strict mode.
export interface OkResult<T> { ok: true; value: T; error?: undefined }
export interface ErrResult<E> { ok: false; error: E; value?: undefined }
export type Result<T, E> = OkResult<T> | ErrResult<E>;

export const Ok = <T>(value: T): OkResult<T> => ({ ok: true, value });
export const Err = <E>(error: E): ErrResult<E> => ({ ok: false, error });
export const isOk = <T, E>(r: Result<T, E>): r is OkResult<T> => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is ErrResult<E> => !r.ok;

export function assertNever(x: never): never {
  throw new Error(`Unreachable: ${JSON.stringify(x)}`);
}

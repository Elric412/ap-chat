import { z } from 'zod';
import type { TokenUsage } from '../adapters';
import type { AgentId, MessageId, RunId, TaskId, CorrelationId } from './ids';
import { MessageIdSchema, RunIdSchema, CorrelationIdSchema } from './ids';
import type { SwarmError } from './errors';
import type { AgentStatus } from './agent';

export type Endpoint =
  | { kind: 'orchestrator' }
  | { kind: 'blackboard' }
  | { kind: 'agent'; agentId: AgentId };

export type MessageType =
  | 'task_assigned'
  | 'task_result'
  | 'task_error'
  | 'spawn_request'
  | 'spawn_granted'
  | 'spawn_denied'
  | 'blackboard_write'
  | 'blackboard_read'
  | 'status_update'
  | 'cancel'
  | 'synthesize_request'
  | 'log';

export type MessagePayload =
  | { type: 'task_assigned'; taskId: TaskId; instruction: string; contextKeys: string[] }
  | { type: 'task_result'; taskId: TaskId; output: string; tokenUsage: TokenUsage }
  | { type: 'task_error'; taskId: TaskId; error: SwarmError }
  | { type: 'spawn_request'; parentTaskId: TaskId; childInstruction: string }
  | { type: 'spawn_granted'; childAgentId: AgentId; childTaskId: TaskId }
  | { type: 'spawn_denied'; reason: SwarmError }
  | { type: 'blackboard_write'; key: string; value: unknown; expectedVersion: number }
  | { type: 'blackboard_read'; key: string }
  | { type: 'status_update'; status: AgentStatus }
  | { type: 'cancel'; reason: string }
  | { type: 'synthesize_request'; resultKeys: string[] }
  | { type: 'log'; level: 'debug' | 'info' | 'warn' | 'error'; text: string };

export interface AgentMessage<P extends MessagePayload = MessagePayload> {
  readonly id: MessageId;
  readonly runId: RunId;
  readonly from: Endpoint;
  readonly to: Endpoint;
  readonly type: P['type'];
  readonly payload: P;
  readonly timestamp: number;
  readonly correlationId: CorrelationId;
}

export const EndpointSchema = z.union([
  z.object({ kind: z.literal('orchestrator') }),
  z.object({ kind: z.literal('blackboard') }),
  z.object({ kind: z.literal('agent'), agentId: z.string().min(1) }),
]);

export const AgentMessageSchema = z.object({
  id: MessageIdSchema,
  runId: RunIdSchema,
  from: EndpointSchema,
  to: EndpointSchema,
  type: z.string(),
  payload: z.unknown(),
  timestamp: z.number().int().nonnegative(),
  correlationId: CorrelationIdSchema,
});

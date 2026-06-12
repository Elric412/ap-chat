/**
 * Shared helper to invoke an LLM via the existing ProviderAdapter + resilience layer.
 * Aggregates streamed tokens into a single text + TokenUsage. Reused by sub-agents,
 * the decomposer, and the synthesizer.
 *
 * Returns Result so callers don't have to wrap try/catch.
 */
import type { StreamMessage } from '../adapters/types';
import { getAdapter } from '../adapters/registry';
import { getProviderCircuit } from '../engine/resilience';
import type { ProviderId } from '../types/models';
import type { InferenceParameters } from '../types/parameters';
import type { TokenUsage } from '../types/adapters';
import type { Result } from '../types/swarm/ids';
import { Ok, Err, assertNever } from '../types/swarm/ids';
import type { SwarmError } from '../types/swarm/errors';
import { EMPTY_TOKEN_USAGE } from '../types/swarm/agent';
import { getDecryptedKey } from '../vault/vault-manager';

export interface AgentLLMRequest {
  provider: ProviderId;
  model: string;
  parameters: InferenceParameters;
  messages: StreamMessage[];
  signal: AbortSignal;
  onDelta?: (text: string) => void;
}

export interface AgentLLMResult {
  text: string;
  tokenUsage: TokenUsage;
}

export async function runAgentLLM(req: AgentLLMRequest): Promise<Result<AgentLLMResult, SwarmError>> {
  const apiKey = await getDecryptedKey(req.provider);
  if (!apiKey && req.provider !== 'ollama') {
    return Err({
      kind: 'provider_error',
      classified: {
        type: 'auth',
        message: `No API key available for ${req.provider}. Unlock vault and add key.`,
        retryable: false,
        providerId: req.provider,
      },
    });
  }

  const adapter = getAdapter(req.provider);
  const circuit = getProviderCircuit(req.provider);

  try {
    return await circuit.execute(async () => {
      let text = '';
      let usage: TokenUsage = { ...EMPTY_TOKEN_USAGE };
      const gen = adapter.stream(apiKey ?? '', {
        model: req.model,
        messages: req.messages,
        parameters: req.parameters,
        signal: req.signal,
      });
      for await (const ev of gen) {
        if (req.signal.aborted) {
          return Err({ kind: 'aborted', runId: '' as never });
        }
        switch (ev.type) {
          case 'delta_text':
            if (ev.content) {
              text += ev.content;
              req.onDelta?.(ev.content);
            }
            break;
          case 'usage':
            if (ev.usage) usage = ev.usage;
            break;
          case 'error':
            if (ev.error) return Err({ kind: 'provider_error', classified: ev.error });
            break;
          case 'message_start':
          case 'delta_thinking':
          case 'tool_call':
          case 'citation':
          case 'message_end':
            break;
          default:
            // Unknown event types are tolerated; new providers may add fields.
            break;
        }
      }
      return Ok<AgentLLMResult>({ text, tokenUsage: usage });
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return Err({ kind: 'aborted', runId: '' as never });
    }
    return Err({ kind: 'internal', message: e instanceof Error ? e.message : String(e) });
  }
}

/** Build a minimal StreamMessage list: optional system + user instruction. */
export function buildSimpleMessages(systemPrompt: string, userText: string): StreamMessage[] {
  const out: StreamMessage[] = [];
  if (systemPrompt.trim()) {
    out.push({ role: 'system', content: [{ type: 'text', text: systemPrompt }] });
  }
  out.push({ role: 'user', content: [{ type: 'text', text: userText }] });
  return out;
}

// Keep import live for tree-shake clarity in case future branches use it.
void assertNever;

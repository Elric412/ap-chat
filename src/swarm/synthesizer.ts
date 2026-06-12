/**
 * S08 — Synthesizer. Collect per-task results from the blackboard and ask the
 * LLM to assemble one final answer. Aggregates token usage into the run cost.
 */
import type { ProviderId } from '../types/models';
import type { Result } from '../types/swarm/ids';
import { Ok, Err } from '../types/swarm/ids';
import type { SwarmError } from '../types/swarm/errors';
import type { ITaskGraph } from '../types/swarm/task-graph';
import type { IBlackboard } from '../types/swarm/blackboard';
import type { TokenUsage } from '../types/adapters';
import { runAgentLLM, buildSimpleMessages } from './agent-llm';
import { DEFAULT_PARAMETERS } from '../constants/default-parameters';

const SYNTHESIZER_SYSTEM = `You are the synthesizer for an autonomous swarm. You receive the original user task and a list of completed sub-task results. Produce ONE coherent final answer for the user.

Rules:
- Address the user directly (no meta-commentary about agents, plans, or DAGs).
- Integrate every relevant sub-result; cite them implicitly by content, not by id.
- If some sub-tasks failed or returned no useful output, gracefully work around them.
- Match the level of formality of the original task.`;

export interface SynthesizeArgs {
  task: string;
  graph: ITaskGraph;
  blackboard: IBlackboard;
  provider: ProviderId;
  model: string;
  signal: AbortSignal;
}

export interface SynthesizeResult {
  finalAnswer: string;
  tokenUsage: TokenUsage;
}

export async function synthesize(args: SynthesizeArgs): Promise<Result<SynthesizeResult, SwarmError>> {
  const nodes = args.graph.getAllNodes();
  const blocks: string[] = [];
  for (const n of nodes) {
    if (n.status === 'done' && n.result) {
      blocks.push(`### ${n.title}\n${n.result}`);
    } else if (n.status === 'failed') {
      blocks.push(`### ${n.title}\n[Sub-task failed: ${n.error?.kind ?? 'unknown'}]`);
    }
  }

  const userPrompt = `Original task:\n${args.task}\n\n---\n\nSub-task results:\n\n${blocks.join('\n\n')}\n\n---\n\nWrite the final answer for the user.`;

  const llmResult = await runAgentLLM({
    provider: args.provider,
    model: args.model,
    parameters: { ...DEFAULT_PARAMETERS, temperature: 0.4 },
    messages: buildSimpleMessages(SYNTHESIZER_SYSTEM, userPrompt),
    signal: args.signal,
  });

  if (!llmResult.ok) return Err(llmResult.error);
  return Ok({ finalAnswer: llmResult.value.text, tokenUsage: llmResult.value.tokenUsage });
}

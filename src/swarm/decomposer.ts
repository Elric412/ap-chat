/**
 * S07 — LLM-driven task decomposition.
 *
 * Builds a prompt that includes the DecomposedPlanSchema shape inline so the
 * model knows the exact JSON structure to emit. Output is validated with
 * Zod.safeParse — malformed JSON or schema violations return `invalid_llm_output`
 * (never a throw).
 */
import { z } from 'zod';
import type { ProviderId } from '../types/models';
import type { Result } from '../types/swarm/ids';
import { Ok, Err, newTaskId, asTaskId, newGraphId } from '../types/swarm/ids';
import type { SwarmError } from '../types/swarm/errors';
import type { TaskNode } from '../types/swarm/task-graph';
import { DecomposedPlanSchema, type DecomposedPlan } from '../types/swarm/task-graph';
import type { RunId, TaskId } from '../types/swarm/ids';
import { TaskGraph } from './task-graph';
import { runAgentLLM, buildSimpleMessages } from './agent-llm';
import { DEFAULT_PARAMETERS } from '../constants/default-parameters';

const DECOMPOSER_SYSTEM = `You are a planning agent inside an autonomous swarm. Decompose the user's task into a small DAG of sub-tasks (1–20 nodes).

Output STRICTLY valid JSON matching this schema (no markdown, no commentary):
{
  "nodes": [
    {
      "tempId": "string (unique per plan, e.g. 't1','t2'...)",
      "title": "short title",
      "instruction": "self-contained instruction for one sub-agent",
      "dependsOn": ["tempId of other nodes that must complete first"],
      "suggestedSkillId": "string id of a skill or null"
    }
  ]
}

Rules:
- Prefer 3–8 nodes for typical tasks; never exceed 20.
- "dependsOn" must reference tempIds defined in the same plan; never a cycle.
- Each instruction must be runnable independently given its dependencies' outputs.
- If the task is trivial, return a single node.
- Output ONLY the JSON object. No explanations.`;

export interface DecomposeArgs {
  task: string;
  runId: RunId;
  provider: ProviderId;
  model: string;
  signal: AbortSignal;
}

export interface DecomposeResult {
  plan: DecomposedPlan;
  graph: TaskGraph;
}

/** Strip ```json fences and trailing commentary so safeParse can succeed. */
function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  // Find first `{` and last `}` — handles models that prepend a sentence.
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    return trimmed.slice(first, last + 1);
  }
  return trimmed;
}

export async function decompose(args: DecomposeArgs): Promise<Result<DecomposeResult, SwarmError>> {
  const messages = buildSimpleMessages(DECOMPOSER_SYSTEM, args.task);

  const llmResult = await runAgentLLM({
    provider: args.provider,
    model: args.model,
    parameters: { ...DEFAULT_PARAMETERS, temperature: 0.2, responseFormat: 'json' },
    messages,
    signal: args.signal,
  });

  if (!llmResult.ok) return Err(llmResult.error);

  const raw = llmResult.value.text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch (e) {
    return Err({
      kind: 'invalid_llm_output',
      message: `Decomposer JSON.parse failed: ${e instanceof Error ? e.message : String(e)}`,
      zodIssues: { raw: raw.slice(0, 500) },
    });
  }

  const safe = DecomposedPlanSchema.safeParse(parsed);
  if (!safe.success) {
    return Err({
      kind: 'invalid_llm_output',
      message: 'Decomposer output failed schema validation',
      zodIssues: safe.error.issues,
    });
  }

  const plan = safe.data;

  // Map tempId → real branded TaskId.
  const idMap = new Map<string, TaskId>();
  for (const n of plan.nodes) idMap.set(n.tempId, newTaskId());

  const graph = new TaskGraph(newGraphId(), args.runId);
  for (const n of plan.nodes) {
    const node: TaskNode = {
      id: idMap.get(n.tempId)!,
      runId: args.runId,
      title: n.title,
      instruction: n.instruction,
      status: 'pending',
      depth: 0,
      dependsOn: [],
      assignedAgentId: null,
      suggestedSkillId: n.suggestedSkillId,
      result: null,
      error: null,
      tokenUsage: null,
      startedAt: null,
      finishedAt: null,
    };
    graph.addNode(node);
  }
  for (const n of plan.nodes) {
    const to = idMap.get(n.tempId)!;
    for (const dep of n.dependsOn) {
      const from = idMap.get(dep);
      if (!from) {
        return Err({
          kind: 'invalid_llm_output',
          message: `Decomposer referenced unknown tempId "${dep}"`,
          zodIssues: null,
        });
      }
      const edge = graph.addEdge({ from, to, kind: 'depends_on' });
      if (!edge.ok) return Err(edge.error);
    }
  }

  // Verify acyclicity (defense in depth — addEdge already rejects cycles).
  const topo = graph.topologicalOrder();
  if (!topo.ok) return Err(topo.error);

  return Ok({ plan, graph });
}

/** Used by chaos test — expose the schema for sanity checks. */
export const __decomposerSchema = DecomposedPlanSchema;
void z;
void asTaskId;

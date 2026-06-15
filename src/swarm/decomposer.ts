/**
 * S07 — Kimi-style roster planner.
 *
 * Replaces the old plain-DAG decomposer with a planner that produces a
 * **roster of specialist agents** (role + system prompt) plus their tasks
 * and dependencies. This is the practical, no-RL version of Moonshot's
 * `create_subagent` / `assign_task` model: the orchestrator gets to spawn
 * named specialists dynamically instead of a flat list of "step N" nodes.
 *
 * Output is validated with Zod. Malformed JSON returns `invalid_llm_output`.
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

const ROSTER_SYSTEM = `You are the ORCHESTRATOR of an autonomous agent swarm. Your job is to assemble a small roster of specialist sub-agents and assign each one a focused sub-task. You do NOT solve the task yourself.

Think like a manager: decide what kinds of specialists this work needs (Researcher, Code Writer, Critic, Data Analyst, Synthesizer, etc.), give each a tight role and system prompt, and wire their dependencies into a DAG.

Output STRICTLY valid JSON matching this schema (no markdown, no commentary):
{
  "nodes": [
    {
      "tempId": "t1",
      "title": "Short human label for this sub-task",
      "agentRole": "Researcher | Code Writer | Critic | Data Analyst | Synthesizer | ...",
      "agentSystemPrompt": "Persona + responsibilities + output contract for this specialist. 1-3 sentences.",
      "instruction": "Self-contained instruction this agent must execute. Reference dependency outputs by tempId if needed.",
      "dependsOn": ["t0"],
      "suggestedSkillId": null
    }
  ]
}

Hard rules:
- 2 to 8 nodes for almost every task; never more than 12. Prefer FEWER specialists doing focused work.
- Every node MUST have a meaningful "agentRole" and "agentSystemPrompt". Do not leave them blank.
- "instruction" is what the specialist actually executes — runnable independently given its dependencies' outputs.
- "dependsOn" only references tempIds defined in this plan; never a cycle.
- The LAST node should typically be a Synthesizer/Writer that depends on the others and produces the final user-facing answer.
- For trivial / single-fact queries, return ONE node with a Generalist role.
- Output ONLY the JSON object. No prose, no fences.`;

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
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    return trimmed.slice(first, last + 1);
  }
  return trimmed;
}

export async function decompose(args: DecomposeArgs): Promise<Result<DecomposeResult, SwarmError>> {
  const messages = buildSimpleMessages(ROSTER_SYSTEM, args.task);

  const llmResult = await runAgentLLM({
    provider: args.provider,
    model: args.model,
    parameters: { ...DEFAULT_PARAMETERS, temperature: 0.3, responseFormat: 'json' },
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
      message: `Planner JSON.parse failed: ${e instanceof Error ? e.message : String(e)}`,
      zodIssues: { raw: raw.slice(0, 500) },
    });
  }

  const safe = DecomposedPlanSchema.safeParse(parsed);
  if (!safe.success) {
    return Err({
      kind: 'invalid_llm_output',
      message: 'Planner output failed schema validation',
      zodIssues: safe.error.issues,
    });
  }

  const plan = safe.data;

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
      agentRole: n.agentRole,
      agentSystemPrompt: n.agentSystemPrompt,
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
          message: `Planner referenced unknown tempId "${dep}"`,
          zodIssues: null,
        });
      }
      const edge = graph.addEdge({ from, to, kind: 'depends_on' });
      if (!edge.ok) return Err(edge.error);
    }
  }

  const topo = graph.topologicalOrder();
  if (!topo.ok) return Err(topo.error);

  return Ok({ plan, graph });
}

/** Exposed for chaos / schema tests. */
export const __decomposerSchema = DecomposedPlanSchema;
void z;
void asTaskId;

/**
 * S12 — Hybrid skill router. Heuristic first; escalate to LLM only when the
 * top-2 candidate scores differ by less than 0.15. Falls back to a generalist
 * agent (chosenSkillId: null) on `no_route`.
 */
import { z } from 'zod';
import type { ProviderId } from '../../types/models';
import type {
  ISkillRouter, RouteRequest, RouteDecision, RouteCandidate,
} from '../../types/swarm/routing';
import type { Result } from '../../types/swarm/ids';
import { Ok, Err, assertNever } from '../../types/swarm/ids';
import type { SwarmError } from '../../types/swarm/errors';
import { scoreSkillForInstruction } from './scorer';
import { runAgentLLM, buildSimpleMessages } from '../agent-llm';
import { DEFAULT_PARAMETERS } from '../../constants/default-parameters';

const LLMRouteSchema = z.object({
  chosenSkillId: z.string().nullable(),
  reasoning: z.string().min(1),
});

export interface SkillRouterConfig {
  provider: ProviderId;
  model: string;
  strategy: 'heuristic' | 'llm' | 'hybrid';
}

export class SkillRouter implements ISkillRouter {
  constructor(private readonly cfg: SkillRouterConfig) {}

  routeHeuristic(req: RouteRequest): RouteDecision {
    const candidates: RouteCandidate[] = req.availableSkills
      .filter((s) => s.enabled)
      .map((s) => scoreSkillForInstruction(s, req.instruction, req.suggestedSkillId));
    candidates.sort((a, b) => b.score - a.score);
    const top = candidates[0];
    return {
      taskId: req.taskId,
      chosenSkillId: top && top.score > 0.1 ? top.skillId : null,
      chosenRole: top && top.score > 0.1 ? top.role : 'Generalist',
      candidates: candidates.slice(0, 5),
      strategy: 'heuristic',
      reasoning: top
        ? `Top score ${top.score.toFixed(2)} for ${top.role} (${top.reasons.join('; ')})`
        : 'No skill matched; using generalist.',
    };
  }

  async routeLLM(req: RouteRequest, signal: AbortSignal): Promise<Result<RouteDecision, SwarmError>> {
    if (req.availableSkills.length === 0) {
      return Ok({
        taskId: req.taskId,
        chosenSkillId: null,
        chosenRole: 'Generalist',
        candidates: [],
        strategy: 'llm',
        reasoning: 'No skills available; using generalist.',
      });
    }
    const catalog = req.availableSkills
      .filter((s) => s.enabled)
      .map((s) => `- id="${s.id}" name="${s.name}" category="${s.category}" tags=[${s.tags.join(',')}]`)
      .join('\n');

    const system = `You select the BEST specialist skill for a sub-task. Output STRICT JSON: {"chosenSkillId":"<id or null>","reasoning":"<one sentence>"}. Output null when no skill is a meaningful fit. No commentary.`;
    const user = `Sub-task instruction:\n${req.instruction}\n\nAvailable skills:\n${catalog}\n\nReturn JSON.`;

    const llm = await runAgentLLM({
      provider: this.cfg.provider,
      model: this.cfg.model,
      parameters: { ...DEFAULT_PARAMETERS, temperature: 0.1, responseFormat: 'json' },
      messages: buildSimpleMessages(system, user),
      signal,
    });
    if (!llm.ok) return Err(llm.error);

    let parsed: unknown;
    try {
      const text = llm.value.text.trim();
      const m = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(m ? m[0] : text);
    } catch (e) {
      return Err({
        kind: 'invalid_llm_output',
        message: `Router JSON.parse failed: ${e instanceof Error ? e.message : String(e)}`,
        zodIssues: null,
      });
    }
    const safe = LLMRouteSchema.safeParse(parsed);
    if (!safe.success) {
      return Err({ kind: 'invalid_llm_output', message: 'Router schema fail', zodIssues: safe.error.issues });
    }
    const chosen = safe.data.chosenSkillId
      ? req.availableSkills.find((s) => s.id === safe.data.chosenSkillId)
      : null;
    return Ok({
      taskId: req.taskId,
      chosenSkillId: chosen?.id ?? null,
      chosenRole: chosen?.name ?? 'Generalist',
      candidates: [],
      strategy: 'llm',
      reasoning: safe.data.reasoning,
    });
  }

  async route(req: RouteRequest, signal: AbortSignal): Promise<Result<RouteDecision, SwarmError>> {
    switch (this.cfg.strategy) {
      case 'heuristic':
        return Ok(this.routeHeuristic(req));
      case 'llm':
        return this.routeLLM(req, signal);
      case 'hybrid': {
        const h = this.routeHeuristic(req);
        const [top, second] = h.candidates;
        const ambiguous = top && second && Math.abs(top.score - second.score) < 0.15;
        if (!ambiguous) return Ok({ ...h, strategy: 'hybrid' });
        const llm = await this.routeLLM(req, signal);
        if (!llm.ok) return Ok({ ...h, strategy: 'hybrid', reasoning: `${h.reasoning} (LLM escalation failed)` });
        return Ok({ ...llm.value, strategy: 'hybrid', candidates: h.candidates });
      }
      default:
        return assertNever(this.cfg.strategy);
    }
  }
}

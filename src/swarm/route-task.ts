/**
 * Routing layer — the lightweight "should this become a swarm?" classifier.
 *
 * Inspired by the Kimi/Claude blueprint: don't run the multi-agent planner on
 * every prompt (it's slow + expensive). A cheap, deterministic heuristic decides
 * whether a task is genuinely multi-part (→ planner builds a roster of agents)
 * or single-intent (→ one generalist agent answers directly).
 *
 * This is intentionally model-free: it runs in microseconds and never burns a
 * token. The orchestrator only calls the planner LLM when this says "swarm".
 */

/** Signals that strongly suggest a task needs decomposition into multiple agents. */
const MULTI_PART_PATTERNS: RegExp[] = [
  /\band then\b/i,
  /\bafter that\b/i,
  /\bfollowed by\b/i,
  /\bstep\s*\d/i,
  /\bfirst\b[\s\S]*\bthen\b/i,
  /\bcompare\b[\s\S]*\b(with|to|and|versus|vs)\b/i,
  /\bpros and cons\b/i,
  /\bresearch\b[\s\S]*\b(and|then|write|summari[sz]e|build|design)\b/i,
  /\b(plan|design|build|implement)\b[\s\S]*\b(and|then|with)\b[\s\S]*\b(test|review|document|deploy)\b/i,
];

/** Enumeration markers ("1.", "- ", "a)") that imply several distinct sub-tasks. */
const ENUMERATION = /(^|\n)\s*(?:\d+[.)]|[-*•]|[a-d][.)])\s+\S/g;

export interface RouteResult {
  /** When true, the orchestrator should run the multi-agent planner. */
  swarm: boolean;
  /** Human-readable reason (surfaced in the trace/log). */
  reason: string;
  /** Rough complexity score for observability. */
  score: number;
}

/**
 * Decide whether a task warrants a multi-agent swarm.
 *
 * Scoring (heuristic, tuned for chat-style prompts):
 *   +2  explicit multi-part phrasing ("and then", "compare X with Y", ...)
 *   +1  per enumerated item beyond the first (capped)
 *   +1  3+ sentences
 *   +1  long prompt (> 280 chars)
 *   +1  multiple question marks (compound ask)
 * A score >= 2 routes to the swarm.
 */
export function routeTask(task: string): RouteResult {
  const text = task.trim();
  if (text.length === 0) {
    return { swarm: false, reason: 'Empty task.', score: 0 };
  }

  let score = 0;
  const reasons: string[] = [];

  const matchedPattern = MULTI_PART_PATTERNS.find((re) => re.test(text));
  if (matchedPattern) {
    score += 2;
    reasons.push('multi-part phrasing');
  }

  const enumMatches = text.match(ENUMERATION);
  const enumCount = enumMatches ? enumMatches.length : 0;
  if (enumCount >= 2) {
    score += Math.min(enumCount - 1, 3);
    reasons.push(`${enumCount} enumerated items`);
  }

  const sentences = text.split(/[.!?]+\s/).filter((s) => s.trim().length > 0);
  if (sentences.length >= 3) {
    score += 1;
    reasons.push(`${sentences.length} sentences`);
  }

  if (text.length > 280) {
    score += 1;
    reasons.push('long prompt');
  }

  const questionMarks = (text.match(/\?/g) ?? []).length;
  if (questionMarks >= 2) {
    score += 1;
    reasons.push('compound question');
  }

  const swarm = score >= 2;
  return {
    swarm,
    score,
    reason: swarm
      ? `Routed to swarm (${reasons.join(', ')}).`
      : 'Single-intent task; one generalist agent.',
  };
}

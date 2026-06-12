/**
 * S12 — Skill scorer. Pure functions; no LLM.
 */
import type { Skill } from '../../types/skills';
import type { RouteCandidate } from '../../types/swarm/routing';

const TOKEN_SPLIT = /[\s,.\-_/:;()[\]{}!?"'`]+/g;

function tokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase().split(TOKEN_SPLIT).filter((t) => t.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function scoreSkillForInstruction(
  skill: Skill,
  instruction: string,
  suggestedSkillId: string | null,
): RouteCandidate {
  const reasons: string[] = [];
  let score = 0;

  if (suggestedSkillId && suggestedSkillId === skill.id) {
    score += 0.5;
    reasons.push('matches decomposer hint');
  }

  const itoks = tokens(instruction);
  const tagSet = new Set(skill.tags.map((t) => t.toLowerCase()));
  const tagOverlap = jaccard(itoks, tagSet);
  if (tagOverlap > 0) {
    score += 0.3 * tagOverlap;
    reasons.push(`tag overlap ${tagOverlap.toFixed(2)}`);
  }

  const catTokens = tokens(skill.category);
  let catHit = 0;
  for (const t of catTokens) if (itoks.has(t)) catHit++;
  if (catHit > 0) {
    score += 0.2;
    reasons.push(`category match (${skill.category})`);
  }

  // Lightweight name/description match.
  const descTokens = tokens(`${skill.name} ${skill.description}`);
  const descOverlap = jaccard(itoks, descTokens);
  if (descOverlap > 0) {
    score += 0.15 * descOverlap;
    reasons.push(`desc overlap ${descOverlap.toFixed(2)}`);
  }

  return {
    skillId: skill.id,
    role: skill.name,
    score: Math.min(1, score),
    reasons,
  };
}

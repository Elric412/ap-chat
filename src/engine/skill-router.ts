/**
 * Smart Skill Router
 *
 * Lightweight, deterministic relevance scorer that picks the top-N skills
 * for a given user message. Avoids dumping the whole catalog into every
 * request (which both wastes tokens and dilutes the model's attention).
 *
 * Scoring is keyword-driven across skill name, tags, category and
 * description, with a small category-intent boost.
 */

import type { Skill, SkillCategory } from '../types/skills';

const STOPWORDS = new Set([
  'the','a','an','and','or','but','if','then','of','to','in','on','for','is','are','be',
  'this','that','it','as','at','by','with','from','my','your','our','their','i','you','we',
  'me','us','them','can','could','should','would','will','do','does','did','have','has','had',
  'please','help','make','create','build','write','show','tell','give','need','want','any','some',
]);

const CATEGORY_KEYWORDS: Record<SkillCategory, string[]> = {
  frontend: ['react','vue','svelte','component','css','tailwind','ui','ux','animation','responsive','design','tsx','jsx','html','dom','accessibility','a11y','figma','layout','typography'],
  backend:  ['api','endpoint','server','express','fastapi','nest','database','sql','postgres','migration','auth','jwt','cookie','session','rest','graphql','rpc','queue','worker'],
  data:     ['data','dataset','csv','json','dataframe','pandas','numpy','plot','chart','graph','statistics','regression','aggregate','etl','analyze','analysis','ml','model','train'],
  devops:   ['docker','kubernetes','k8s','helm','ci','cd','pipeline','github','actions','deploy','infra','terraform','aws','gcp','azure','observability','log','metric'],
  design:   ['design','figma','typography','spacing','grid','palette','color','brand','wireframe','mockup','prototype','aesthetic','visual'],
  writing:  ['write','draft','copy','blog','article','essay','tone','grammar','edit','proofread','headline','seo'],
  analysis: ['analyze','compare','evaluate','review','audit','assess','benchmark','metric','report'],
  security: ['security','vulnerability','xss','csrf','sql injection','auth','owasp','token','secret','crypto','encrypt','decrypt','sanitize'],
  mobile:   ['ios','android','swift','kotlin','react native','flutter','expo','mobile','tablet'],
  general:  [],
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#./_-]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Score a skill against a tokenized user message. */
function scoreSkill(skill: Skill, tokens: Set<string>, rawLower: string): number {
  let score = 0;

  const name = skill.name.toLowerCase();
  for (const t of tokens) if (name.includes(t)) score += 6;

  for (const tag of skill.tags) {
    const tl = tag.toLowerCase();
    if (tokens.has(tl)) score += 4;
    else if (rawLower.includes(tl)) score += 2;
  }

  const descTokens = tokenize(skill.description);
  for (const dt of descTokens) if (tokens.has(dt)) score += 1;

  const catWords = CATEGORY_KEYWORDS[skill.category] ?? [];
  for (const kw of catWords) {
    if (rawLower.includes(kw)) score += 2;
  }

  // Mild prior — pinned/builtin skills carry a tiny boost so curated
  // expertise wins ties over user-imported clutter.
  if (skill.isBuiltin) score += 0.25;

  return score;
}

export interface RoutedSkills {
  selected: Skill[];
  reasoning: string;
  scored: Array<{ id: string; name: string; score: number }>;
}

/**
 * Pick the top-N skills relevant to `userMessage`. If no skill scores
 * above the threshold, returns an empty selection so the agent answers
 * generically.
 */
export function routeSkills(
  skills: Skill[],
  userMessage: string,
  opts: { maxSkills?: number; minScore?: number } = {},
): RoutedSkills {
  const maxSkills = opts.maxSkills ?? 3;
  const minScore = opts.minScore ?? 3;

  if (skills.length === 0 || !userMessage.trim()) {
    return { selected: [], reasoning: 'no-skills-available', scored: [] };
  }

  const rawLower = userMessage.toLowerCase();
  const tokens = new Set(tokenize(userMessage));

  const scored = skills
    .map((s) => ({ skill: s, score: scoreSkill(s, tokens, rawLower) }))
    .sort((a, b) => b.score - a.score);

  const selected = scored
    .filter((s) => s.score >= minScore)
    .slice(0, maxSkills)
    .map((s) => s.skill);

  return {
    selected,
    reasoning: selected.length === 0
      ? 'no-match-above-threshold'
      : `routed:${selected.map((s) => s.name).join(',')}`,
    scored: scored.slice(0, 8).map((s) => ({ id: s.skill.id, name: s.skill.name, score: s.score })),
  };
}

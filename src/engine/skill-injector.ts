/**
 * Skill Injector — Builds skill awareness blocks for system prompt injection
 */

import type { Skill } from '../types/skills';

/**
 * Build the complete skill awareness block to append to the system prompt.
 * Single-pass strategy: catalog + full instructions for all available skills.
 */
export function buildSkillInjectionBlock(skills: Skill[]): string {
  if (skills.length === 0) return '';

  const parts: string[] = [];

  parts.push(`\n\n---\n\n## Available Expert Skills\n`);
  parts.push(`You have access to specialized expert skills. Review the user's request and determine relevance:\n`);
  parts.push(`- For casual conversation, greetings, or simple questions: IGNORE all skills and respond naturally.`);
  parts.push(`- For task-specific requests: match against the skill catalog below and follow relevant skill instructions precisely.`);
  parts.push(`- For complex cross-domain tasks: you MAY apply multiple skills simultaneously.`);
  parts.push(`- Skills are optional guidance — only apply when the task genuinely benefits from specialized expertise.\n`);

  // Section A — Compact Catalog
  parts.push(`### Skill Catalog\n`);
  for (const skill of skills) {
    parts.push(`- **${skill.name}**: ${skill.description}`);
  }

  // Section B — Full Instructions
  parts.push(`\n### Skill Instructions\n`);
  for (const skill of skills) {
    parts.push(`<skill name="${skill.name}">`);
    parts.push(skill.instructions);
    parts.push(`</skill>\n`);
  }

  return parts.join('\n');
}

/**
 * Build a compact catalog-only block for two-pass resolution.
 */
export function buildSkillCatalogBlock(skills: Skill[]): string {
  if (skills.length === 0) return '';

  const parts: string[] = [];
  parts.push(`Analyze the user's message and determine which skills are relevant.\n`);
  parts.push(`Available skills:\n`);
  for (const skill of skills) {
    parts.push(`- id: "${skill.id}" | name: "${skill.name}" | description: ${skill.description}`);
  }
  parts.push(`\nRespond with JSON: { "selectedIds": string[], "reasoning": string, "noSkillsNeeded": boolean }`);
  parts.push(`Select at most 3 skills. If the message is casual conversation, set noSkillsNeeded to true and selectedIds to [].`);

  return parts.join('\n');
}

/**
 * Build injection block for specific resolved skills only (two-pass result).
 */
export function buildResolvedSkillBlock(skills: Skill[], selectedIds: string[]): string {
  const selected = skills.filter((s) => selectedIds.includes(s.id));
  if (selected.length === 0) return '';
  return buildSkillInjectionBlock(selected);
}

/**
 * Estimate tokens consumed by skill injection.
 */
export function estimateSkillTokens(skills: Skill[]): number {
  if (skills.length === 0) return 0;
  const block = buildSkillInjectionBlock(skills);
  return Math.ceil(block.length / 4);
}

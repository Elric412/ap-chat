/**
 * Tests for the swarm routing layer — the cheap, model-free "should this become
 * a multi-agent swarm?" classifier that gates the planner LLM call.
 */
import { describe, it, expect } from 'vitest';
import { routeTask } from '../swarm/route-task';

describe('routeTask', () => {
  it('keeps simple single-intent prompts as one generalist agent', () => {
    for (const task of [
      'What is the capital of France?',
      'Build secure backend API',
      'Summarize this paragraph.',
      'Explain API schema',
    ]) {
      const r = routeTask(task);
      expect(r.swarm).toBe(false);
    }
  });

  it('routes explicit multi-part phrasing to the swarm', () => {
    const r = routeTask('Research the top 3 web frameworks and then write a comparison report.');
    expect(r.swarm).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(2);
  });

  it('routes "compare X with Y" prompts to the swarm', () => {
    const r = routeTask('Compare PostgreSQL with MongoDB for a high-write analytics workload.');
    expect(r.swarm).toBe(true);
  });

  it('routes enumerated multi-step task lists to the swarm', () => {
    const task = [
      'Do the following:',
      '1. Audit the auth module for vulnerabilities',
      '2. Propose fixes',
      '3. Write tests for the fixes',
    ].join('\n');
    const r = routeTask(task);
    expect(r.swarm).toBe(true);
  });

  it('routes long multi-sentence research prompts to the swarm', () => {
    const task =
      'I want to launch a SaaS product. First analyze the market and competitors. ' +
      'Then design a pricing model. After that, draft a go-to-market plan and outline the MVP feature set.';
    const r = routeTask(task);
    expect(r.swarm).toBe(true);
  });

  it('handles empty input safely', () => {
    const r = routeTask('   ');
    expect(r.swarm).toBe(false);
    expect(r.score).toBe(0);
  });
});

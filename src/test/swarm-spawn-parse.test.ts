/**
 * Tests for the tolerant spawn-directive parser used by sub-agents to request
 * one deeper specialist. Covers the preferred sentinel-tag contract and the
 * legacy bare-JSON form (backward compatibility).
 */
import { describe, it, expect } from 'vitest';
import { parseSpawnDirective, SPAWN_TAG_OPEN, SPAWN_TAG_CLOSE } from '../swarm/sub-agent';

describe('parseSpawnDirective', () => {
  it('parses the sentinel-tag form embedded in prose', () => {
    const text = `I should delegate this first.\n${SPAWN_TAG_OPEN}Research the DB schema${SPAWN_TAG_CLOSE}`;
    expect(parseSpawnDirective(text)).toEqual({ spawnInstruction: 'Research the DB schema' });
  });

  it('parses the legacy bare-JSON form', () => {
    expect(parseSpawnDirective('{"spawnInstruction":"Find the API contract"}')).toEqual({
      spawnInstruction: 'Find the API contract',
    });
  });

  it('parses legacy JSON inside a code fence', () => {
    const text = '```json\n{"spawnInstruction":"Gather data"}\n```';
    expect(parseSpawnDirective(text)).toEqual({ spawnInstruction: 'Gather data' });
  });

  it('returns null for a normal direct answer (no spawn)', () => {
    expect(parseSpawnDirective('The capital of France is Paris.')).toBeNull();
  });

  it('returns null for an empty sentinel block', () => {
    expect(parseSpawnDirective(`${SPAWN_TAG_OPEN}   ${SPAWN_TAG_CLOSE}`)).toBeNull();
  });

  it('returns null for unrelated JSON objects', () => {
    expect(parseSpawnDirective('{"answer":"42"}')).toBeNull();
  });
});

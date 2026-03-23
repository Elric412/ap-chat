/**
 * Cost Calculator Tests — Per ECC tdd-guide: test critical business logic.
 */

import { describe, it, expect } from 'vitest';
import { calculateCost } from '../engine/cost-calculator';
import type { TokenCounts } from '../types/messages';
import type { ModelPricing } from '../types/models';

const PRICING: ModelPricing = {
  inputPerMillionTokens: 3.0,
  outputPerMillionTokens: 15.0,
  thinkingPerMillionTokens: 15.0,
  cachedInputPerMillionTokens: 1.5,
};

describe('calculateCost', () => {
  it('calculates basic input/output cost', () => {
    const tokens: TokenCounts = { input: 1000, output: 500, thinking: 0, cached: 0 };
    const result = calculateCost(tokens, PRICING);
    expect(result.inputCost).toBeCloseTo(0.003);
    expect(result.outputCost).toBeCloseTo(0.0075);
    expect(result.totalCost).toBeCloseTo(0.0105);
  });

  it('includes thinking cost when present', () => {
    const tokens: TokenCounts = { input: 1000, output: 500, thinking: 2000, cached: 0 };
    const result = calculateCost(tokens, PRICING);
    expect(result.thinkingCost).toBeCloseTo(0.03);
    expect(result.totalCost).toBeCloseTo(0.0405);
  });

  it('applies cached discount', () => {
    const tokens: TokenCounts = { input: 1000, output: 500, thinking: 0, cached: 500 };
    const result = calculateCost(tokens, PRICING);
    expect(result.cachedDiscount).toBeGreaterThan(0);
    expect(result.totalCost).toBeLessThan(result.inputCost + result.outputCost);
  });

  it('handles zero tokens', () => {
    const tokens: TokenCounts = { input: 0, output: 0, thinking: 0, cached: 0 };
    const result = calculateCost(tokens, PRICING);
    expect(result.totalCost).toBe(0);
  });

  it('handles pricing without thinking/cached fields', () => {
    const basicPricing: ModelPricing = {
      inputPerMillionTokens: 2.0,
      outputPerMillionTokens: 8.0,
    };
    const tokens: TokenCounts = { input: 1000, output: 1000, thinking: 500, cached: 200 };
    const result = calculateCost(tokens, basicPricing);
    expect(result.thinkingCost).toBe(0);
    expect(result.cachedDiscount).toBe(0);
  });
});

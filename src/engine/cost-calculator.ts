/**
 * Cost Calculator
 * 
 * Computes cost estimates from token counts and model pricing.
 */

import type { TokenCounts, CostEstimate } from '../types/messages';
import type { ModelPricing } from '../types/models';

export function calculateCost(tokens: TokenCounts, pricing: ModelPricing): CostEstimate {
  const inputCost = (tokens.input / 1_000_000) * pricing.inputPerMillionTokens;
  const outputCost = (tokens.output / 1_000_000) * pricing.outputPerMillionTokens;
  const thinkingCost = pricing.thinkingPerMillionTokens
    ? (tokens.thinking / 1_000_000) * pricing.thinkingPerMillionTokens
    : 0;
  const cachedDiscount = pricing.cachedInputPerMillionTokens
    ? (tokens.cached / 1_000_000) * (pricing.inputPerMillionTokens - pricing.cachedInputPerMillionTokens)
    : 0;

  return {
    inputCost,
    outputCost,
    thinkingCost,
    cachedDiscount,
    totalCost: inputCost + outputCost + thinkingCost - cachedDiscount,
  };
}

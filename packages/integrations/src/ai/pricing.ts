import type { AiUsage } from "@gizito/core";

export type ModelPrice = {
  readonly inputUsdPerMillion: number;
  readonly outputUsdPerMillion: number;
  readonly cacheReadUsdPerMillion: number;
};

export const anthropicModelPriceMap: Readonly<Record<string, ModelPrice>> = {
  "claude-haiku-5-5": {
    inputUsdPerMillion: 0.1,
    outputUsdPerMillion: 0.5,
    cacheReadUsdPerMillion: 0.01,
  },
  "claude-sonnet-5-5": {
    inputUsdPerMillion: 2,
    outputUsdPerMillion: 10,
    cacheReadUsdPerMillion: 0.2,
  },
  "claude-opus-5-5": {
    inputUsdPerMillion: 4,
    outputUsdPerMillion: 20,
    cacheReadUsdPerMillion: 0.2,
  },
};

export const CACHE_WRITE_5M_MULTIPLIER = 1.25;
export const CACHE_WRITE_1H_MULTIPLIER = 2;

const TOKENS_PER_MILLION = 1_000_000;
const CENTS_PER_DOLLAR = 100;
const COST_DECIMAL_FACTOR = 1_000_000;

export type TokenCount = {
  readonly uncachedInputTokens: number;
  readonly cacheWrite5mTokens: number;
  readonly cacheWrite1hTokens: number;
  readonly cacheReadTokens: number;
  readonly outputTokens: number;
};

export function findModelPrice(model: string): ModelPrice | null {
  return anthropicModelPriceMap[model] ?? null;
}

export function usageOf(price: ModelPrice, count: TokenCount): AiUsage {
  const costUsd =
    (count.uncachedInputTokens * price.inputUsdPerMillion +
      count.cacheWrite5mTokens * price.inputUsdPerMillion * CACHE_WRITE_5M_MULTIPLIER +
      count.cacheWrite1hTokens * price.inputUsdPerMillion * CACHE_WRITE_1H_MULTIPLIER +
      count.cacheReadTokens * price.cacheReadUsdPerMillion +
      count.outputTokens * price.outputUsdPerMillion) /
    TOKENS_PER_MILLION;
  return {
    inputTokens:
      count.uncachedInputTokens +
      count.cacheWrite5mTokens +
      count.cacheWrite1hTokens +
      count.cacheReadTokens,
    outputTokens: count.outputTokens,
    costCents: Math.round(costUsd * CENTS_PER_DOLLAR * COST_DECIMAL_FACTOR) / COST_DECIMAL_FACTOR,
  };
}

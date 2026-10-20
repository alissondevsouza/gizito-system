import { describe, expect, it } from "bun:test";
import { findModelPrice, type ModelPrice, usageOf } from "#src/ai/pricing.ts";

const zeroCount = {
  uncachedInputTokens: 0,
  cacheWrite5mTokens: 0,
  cacheWrite1hTokens: 0,
  cacheReadTokens: 0,
  outputTokens: 0,
};

function priceOf(model: string): ModelPrice {
  const price = findModelPrice(model);
  if (price === null) throw new Error(`modelo sem preço: ${model}`);
  return price;
}

describe("custo por chamada (spec F1-05, RF-03)", () => {
  it.each<[string, Partial<typeof zeroCount>, number]>([
    ["claude-sonnet-5-5", { uncachedInputTokens: 1_000_000 }, 200],
    ["claude-sonnet-5-5", { outputTokens: 1_000_000 }, 1000],
    ["claude-sonnet-5-5", { cacheReadTokens: 1_000_000 }, 20],
    ["claude-sonnet-5-5", { cacheWrite5mTokens: 1_000_000 }, 250],
    ["claude-sonnet-5-5", { cacheWrite1hTokens: 1_000_000 }, 400],
    ["claude-haiku-5-5", { uncachedInputTokens: 1_000_000, outputTokens: 1_000_000 }, 60],
    ["claude-haiku-5-5", { cacheReadTokens: 1_000_000 }, 1],
    ["claude-opus-5-5", { uncachedInputTokens: 1_000_000, outputTokens: 1_000_000 }, 2400],
  ])("%s com %j custa %d centavos de dólar", (model, count, costCents) => {
    expect(usageOf(priceOf(model), { ...zeroCount, ...count }).costCents).toBeCloseTo(costCents, 6);
  });

  it("soma entrada sem cache, escrita e leitura de cache em inputTokens", () => {
    const usage = usageOf(priceOf("claude-haiku-5-5"), {
      uncachedInputTokens: 1000,
      cacheWrite5mTokens: 3000,
      cacheWrite1hTokens: 0,
      cacheReadTokens: 500,
      outputTokens: 700,
    });
    expect(usage.inputTokens).toBe(4500);
    expect(usage.outputTokens).toBe(700);
    expect(usage.costCents).toBeCloseTo(0.01 + 0.0375 + 0.0005 + 0.035, 6);
  });

  it("modelo fora da tabela não tem preço", () => {
    expect(findModelPrice("claude-haiku-4-5")).toBeNull();
    expect(findModelPrice("gemini-2.5-flash")).toBeNull();
  });
});

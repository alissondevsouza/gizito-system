import { describe, expect, it } from "bun:test";
import { photoExtractionOf } from "#src/__tests__/pipeline/__fixtures__/extraction.ts";
import {
  buildExtractionCacheKey,
  createMemoryExtractionCache,
} from "#src/pipeline/extraction-cache.ts";

const baseKeyInput = {
  contentHash: "a".repeat(64),
  grade: "5",
  subject: "math",
  taxonomyVersion: "tax-v1",
  promptVersion: "extract-v1",
  model: "claude-haiku-5-5",
} as const;

describe("chave do cache da extração (spec F1-06, RF-04)", () => {
  it("muda com hash, ano, disciplina, taxonomia, prompt e modelo", () => {
    const keyList = [
      baseKeyInput,
      { ...baseKeyInput, contentHash: "b".repeat(64) },
      { ...baseKeyInput, grade: "6" as const },
      { ...baseKeyInput, subject: "portuguese" as const },
      { ...baseKeyInput, taxonomyVersion: "tax-v2" },
      { ...baseKeyInput, promptVersion: "extract-v2" },
      { ...baseKeyInput, model: "claude-sonnet-5-5" },
    ].map(buildExtractionCacheKey);
    expect(new Set(keyList).size).toBe(keyList.length);
  });

  it("é igual para a mesma entrada", () => {
    expect(buildExtractionCacheKey(baseKeyInput)).toBe(
      buildExtractionCacheKey({ ...baseKeyInput }),
    );
  });
});

describe("cache da extração em memória", () => {
  it("devolve null sem entrada e a entrada guardada depois", async () => {
    const cache = createMemoryExtractionCache();
    const entry = {
      extraction: photoExtractionOf(),
      issueList: [],
      expireDatetime: new Date("2026-11-19T12:00:00.000Z"),
    };
    expect(await cache.find("chave")).toBeNull();
    await cache.save("chave", entry);
    expect(await cache.find("chave")).toBe(entry);
  });
});

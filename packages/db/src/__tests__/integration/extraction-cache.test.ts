import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import type { PhotoExtraction, ValidationIssue } from "@gizito/core";
import { eq, sql } from "drizzle-orm";
import {
  findExtractionCacheEntry,
  purgeExpiredExtractionCache,
  saveExtractionCacheEntry,
} from "#src/extraction-cache.ts";
import { extractionCache } from "#src/schema/index.ts";
import {
  createTestDatabase,
  type TestDatabase,
  truncateAllTables,
} from "#src/test-helpers/index.ts";

const NOW = new Date("2026-10-22T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const extraction: PhotoExtraction = {
  legibility: "good",
  isSchoolMaterial: true,
  photoIssueList: [],
  topicCandidateList: [
    { topicId: "ma5-fractions", confidence: "high", evidence: "título da página e seis contas" },
  ],
  unsupportedTopicIdList: [],
  materialProfile: {
    exerciseFormatList: ["computation"],
    notationList: ["fraction_slash"],
    terminologyList: ["numerador"],
    contextThemeList: [],
    apparentLevel: "at_grade",
    hasFigures: false,
    isHandwritten: false,
  },
  sourceWarningCodeList: [],
};

const issueList: ValidationIssue[] = [
  {
    code: "extraction_personal_data_dropped",
    severity: "warning",
    stage: "extract",
    itemId: null,
    note: null,
    excerpt: null,
  },
];

let testDatabase: TestDatabase;

beforeAll(async () => {
  testDatabase = await createTestDatabase();
});

afterAll(async () => {
  await testDatabase.destroy();
});

beforeEach(async () => {
  await truncateAllTables(testDatabase.db);
});

describe("cache da extração (spec F2-02, RF-02)", () => {
  it("devolve null sem entrada e a entrada gravada, validada, com a validade", async () => {
    expect(await findExtractionCacheEntry(testDatabase.db, "chave")).toBeNull();
    const expireDatetime = new Date(NOW.getTime() + 30 * DAY_MS);
    await saveExtractionCacheEntry(testDatabase.db, "chave", {
      extraction,
      issueList,
      expireDatetime,
    });
    expect(await findExtractionCacheEntry(testDatabase.db, "chave")).toEqual({
      extraction,
      issueList,
      expireDatetime,
    });
    const typeList = (await testDatabase.db.execute(
      sql`SELECT jsonb_typeof(extraction) AS extraction_type, jsonb_typeof(issue_list) AS issue_type FROM extraction_cache`,
    )) as unknown as { extraction_type: string; issue_type: string }[];
    expect(Array.from(typeList)).toEqual([{ extraction_type: "object", issue_type: "array" }]);
  });

  it("gravar de novo na mesma chave sobrescreve extração, avisos e validade", async () => {
    await saveExtractionCacheEntry(testDatabase.db, "chave", {
      extraction,
      issueList,
      expireDatetime: new Date(NOW.getTime() - DAY_MS),
    });
    const renewed = {
      extraction: { ...extraction, legibility: "partial" as const },
      issueList: [],
      expireDatetime: new Date(NOW.getTime() + 30 * DAY_MS),
    };
    await saveExtractionCacheEntry(testDatabase.db, "chave", renewed);
    expect(await findExtractionCacheEntry(testDatabase.db, "chave")).toEqual(renewed);
    const rowList = await testDatabase.db.select().from(extractionCache);
    expect(rowList).toHaveLength(1);
  });

  it("entrada que não passa no schema conta como ausente", async () => {
    await testDatabase.db.insert(extractionCache).values({
      cacheKey: "corrompida",
      extraction: { legibility: "talvez" },
      issueList: [],
      expireDatetime: new Date(NOW.getTime() + DAY_MS),
    });
    expect(await findExtractionCacheEntry(testDatabase.db, "corrompida")).toBeNull();
  });

  it("recusa gravar extração fora do schema", async () => {
    expect(
      saveExtractionCacheEntry(testDatabase.db, "chave", {
        extraction: { ...extraction, legibility: "talvez" } as unknown as PhotoExtraction,
        issueList,
        expireDatetime: NOW,
      }),
    ).rejects.toThrow();
  });

  it("purga só as vencidas, em lotes, e devolve quantas apagou", async () => {
    for (const [cacheKey, offsetDays] of [
      ["vencida-1", -3],
      ["vencida-2", -2],
      ["vence-agora", 0],
      ["valida", 1],
    ] as const) {
      await saveExtractionCacheEntry(testDatabase.db, cacheKey, {
        extraction,
        issueList,
        expireDatetime: new Date(NOW.getTime() + offsetDays * DAY_MS),
      });
    }
    expect(await purgeExpiredExtractionCache(testDatabase.db, { now: NOW, batchSize: 2 })).toBe(2);
    expect(await findExtractionCacheEntry(testDatabase.db, "vencida-1")).toBeNull();
    expect(await purgeExpiredExtractionCache(testDatabase.db, { now: NOW, batchSize: 2 })).toBe(1);
    expect(await purgeExpiredExtractionCache(testDatabase.db, { now: NOW, batchSize: 2 })).toBe(0);
    const remaining = await testDatabase.db
      .select({ cacheKey: extractionCache.cacheKey })
      .from(extractionCache)
      .where(eq(extractionCache.cacheKey, "valida"));
    expect(remaining).toHaveLength(1);
  });
});

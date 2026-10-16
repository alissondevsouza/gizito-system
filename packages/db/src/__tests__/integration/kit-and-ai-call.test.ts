import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq, sql } from "drizzle-orm";
import {
  buildAiCallInsert,
  buildKitInsert,
  buildOrderInsert,
  expectSqlState,
  SQL_STATE,
} from "#src/__tests__/integration/helpers.ts";
import { aiCall, kit, order } from "#src/schema/index.ts";
import { createTestDatabase, type TestDatabase } from "#src/test-helpers/index.ts";

let testDatabase: TestDatabase;

beforeAll(async () => {
  testDatabase = await createTestDatabase();
});

afterAll(async () => {
  await testDatabase.destroy();
});

async function insertOrderId(): Promise<string> {
  const [row] = await testDatabase.db.insert(order).values(buildOrderInsert()).returning();
  if (!row) throw new Error("insert returned no row");
  return row.orderId;
}

describe("kit", () => {
  it("insere kit com as duas keys e devolve study_kit como JSON", async () => {
    const orderId = await insertOrderId();
    const [row] = await testDatabase.db.insert(kit).values(buildKitInsert(orderId)).returning();
    expect(row?.studyKit).toEqual({ topicIdList: ["fractions"] });
    const typeList = (await testDatabase.db.execute(
      sql`SELECT jsonb_typeof(study_kit) AS study_kit_type FROM kit WHERE kit_id = ${row?.kitId ?? ""}`,
    )) as unknown as { study_kit_type: string }[];
    expect(Array.from(typeList)).toEqual([{ study_kit_type: "object" }]);
    expect(row?.supersededByKitId).toBeNull();
    expect(row?.deleteDatetime).toBeNull();
  });

  it("superseded_by_kit_id aponta para o kit novo e a relation supersededByKit o carrega", async () => {
    const orderId = await insertOrderId();
    const [oldKit] = await testDatabase.db.insert(kit).values(buildKitInsert(orderId)).returning();
    const [newKit] = await testDatabase.db.insert(kit).values(buildKitInsert(orderId)).returning();
    if (!oldKit || !newKit) throw new Error("insert returned no row");
    await testDatabase.db
      .update(kit)
      .set({ supersededByKitId: newKit.kitId })
      .where(eq(kit.kitId, oldKit.kitId));
    const loaded = await testDatabase.db.query.kit.findFirst({
      where: eq(kit.kitId, oldKit.kitId),
      with: { supersededByKit: true },
    });
    expect(loaded?.supersededByKit?.kitId).toBe(newKit.kitId);
    const loadedOrder = await testDatabase.db.query.order.findFirst({
      where: eq(order.orderId, orderId),
      with: { kitList: true },
    });
    expect(loadedOrder?.kitList).toHaveLength(2);
  });

  it.each([
    ["page_count_activities", { pageCountActivities: 0 }],
    ["page_count_answer_key", { pageCountAnswerKey: 0 }],
  ] as const)("rejeita %s zero", async (_, overrides) => {
    const orderId = await insertOrderId();
    await expectSqlState(
      testDatabase.db.insert(kit).values(buildKitInsert(orderId, overrides)),
      SQL_STATE.checkViolation,
    );
  });

  it("limpar study_kit na retenção mantém a linha", async () => {
    const orderId = await insertOrderId();
    const [row] = await testDatabase.db.insert(kit).values(buildKitInsert(orderId)).returning();
    if (!row) throw new Error("insert returned no row");
    const [purged] = await testDatabase.db
      .update(kit)
      .set({ studyKit: null, deleteDatetime: new Date() })
      .where(eq(kit.kitId, row.kitId))
      .returning();
    expect(purged?.studyKit).toBeNull();
    expect(purged?.deleteDatetime).toBeInstanceOf(Date);
    expect(purged?.activitiesStorageKey).toBe(row.activitiesStorageKey);
  });
});

describe("ai_call", () => {
  it("grava custo fracionário em centavos como número", async () => {
    const orderId = await insertOrderId();
    const [row] = await testDatabase.db
      .insert(aiCall)
      .values({
        orderId,
        stage: "extract",
        model: "cheap-model",
        promptVersion: "extract-v1",
        inputTokenCount: 1200,
        outputTokenCount: 300,
        costCents: 0.012345,
        durationMs: 850,
        outcomeCode: "ok",
      })
      .returning();
    expect(typeof row?.costCents).toBe("number");
    expect(row?.costCents).toBeCloseTo(0.012345, 6);
  });

  it.each([
    ["input_token_count", { inputTokenCount: -1 }],
    ["output_token_count", { outputTokenCount: -1 }],
    ["cost_cents", { costCents: -0.000001 }],
    ["duration_ms", { durationMs: -1 }],
  ] as const)("rejeita %s negativo", async (_, overrides) => {
    const orderId = await insertOrderId();
    await expectSqlState(
      testDatabase.db.insert(aiCall).values(buildAiCallInsert(orderId, overrides)),
      SQL_STATE.checkViolation,
    );
  });
});

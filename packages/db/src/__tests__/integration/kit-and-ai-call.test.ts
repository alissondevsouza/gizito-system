import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import {
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

  it("rejeita contagem de páginas zero", async () => {
    const orderId = await insertOrderId();
    await expectSqlState(
      testDatabase.db.insert(kit).values(buildKitInsert(orderId, { pageCountAnswerKey: 0 })),
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

  it("rejeita contagens negativas", async () => {
    const orderId = await insertOrderId();
    await expectSqlState(
      testDatabase.db.insert(aiCall).values({
        orderId,
        stage: "generate",
        model: "strong-model",
        promptVersion: "generate-v1",
        inputTokenCount: -1,
        outputTokenCount: 0,
        costCents: 0,
        durationMs: 0,
        outcomeCode: "ok",
      }),
      SQL_STATE.checkViolation,
    );
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  InvalidTransitionError,
  kitStorageKey,
  type OrderStatus,
  type PublishKitInput,
} from "@gizito/core";
import { eq } from "drizzle-orm";
import { ZodError } from "zod";
import { buildOrderInsert, FIXED_DATETIME } from "#src/__tests__/integration/helpers.ts";
import { OrderNotFoundError, publishKit } from "#src/order/index.ts";
import { job, kit, order } from "#src/schema/index.ts";
import {
  createTestDatabase,
  type TestDatabase,
  truncateAllTables,
} from "#src/test-helpers/index.ts";

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

async function insertOrder(status: OrderStatus) {
  const [row] = await testDatabase.db
    .insert(order)
    .values(buildOrderInsert({ status }))
    .returning();
  if (!row) throw new Error("insert returned no row");
  return row;
}

function buildPublishKitInput(
  orderId: string,
  overrides: Partial<PublishKitInput> = {},
): PublishKitInput {
  const kitId = crypto.randomUUID();
  return {
    orderId,
    kitId,
    studyKit: { topicIdList: ["fractions"] },
    generationVersion: "gen-v1",
    taxonomyVersion: "tax-v1",
    activitiesStorageKey: kitStorageKey(orderId, kitId, "activities"),
    answerKeyStorageKey: kitStorageKey(orderId, kitId, "answer_key"),
    pageCountActivities: 6,
    pageCountAnswerKey: 8,
    ...overrides,
  };
}

function publish(input: PublishKitInput) {
  return testDatabase.db.transaction((tx) => publishKit(tx, input, { now: FIXED_DATETIME }));
}

async function expectNothingPublished(orderId: string, status: OrderStatus) {
  const [reloaded] = await testDatabase.db.select().from(order).where(eq(order.orderId, orderId));
  expect(reloaded?.status).toBe(status);
  expect(reloaded?.readyDatetime).toBeNull();
  expect(await testDatabase.db.$count(kit)).toBe(0);
  expect(await testDatabase.db.$count(job)).toBe(0);
}

describe("publishKit", () => {
  it("processing vira ready com o kit e as duas keys e enfileira order.notify kit_ready", async () => {
    const processingOrder = await insertOrder("processing");
    const input = buildPublishKitInput(processingOrder.orderId);
    const result = await publish(input);
    if (!result.ok) throw result.error;
    expect(result.value.kitId).toBe(input.kitId);
    const [reloaded] = await testDatabase.db
      .select()
      .from(order)
      .where(eq(order.orderId, processingOrder.orderId));
    expect(reloaded?.status).toBe("ready");
    expect(reloaded?.readyDatetime).toEqual(FIXED_DATETIME);
    const [publishedKit] = await testDatabase.db
      .select()
      .from(kit)
      .where(eq(kit.kitId, input.kitId));
    expect(publishedKit).toMatchObject({
      orderId: processingOrder.orderId,
      studyKit: { topicIdList: ["fractions"] },
      activitiesStorageKey: input.activitiesStorageKey,
      answerKeyStorageKey: input.answerKeyStorageKey,
      pageCountActivities: 6,
      pageCountAnswerKey: 8,
      publishedDatetime: FIXED_DATETIME,
      supersededByKitId: null,
    });
    const [notifyJob] = await testDatabase.db
      .select()
      .from(job)
      .where(eq(job.jobId, result.value.notifyJobId));
    expect(notifyJob).toMatchObject({
      name: "order.notify",
      status: "pending",
      payload: { name: "order.notify", orderId: processingOrder.orderId, kind: "kit_ready" },
    });
  });

  it.each(["refunded", "paid", "failed"] as const)(
    "pedido em %s não publica: InvalidTransitionError sem kit nem job",
    async (status) => {
      const blockedOrder = await insertOrder(status);
      const result = await publish(buildPublishKitInput(blockedOrder.orderId));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(InvalidTransitionError);
      await expectNothingPublished(blockedOrder.orderId, status);
    },
  );

  it("pedido já ready não recebe segundo kit", async () => {
    const processingOrder = await insertOrder("processing");
    await publish(buildPublishKitInput(processingOrder.orderId));
    const second = await publish(buildPublishKitInput(processingOrder.orderId));
    expect(second.ok).toBe(false);
    expect(await testDatabase.db.$count(kit)).toBe(1);
    expect(await testDatabase.db.$count(job)).toBe(1);
  });

  it("pedido inexistente devolve OrderNotFoundError", async () => {
    const result = await publish(buildPublishKitInput(crypto.randomUUID()));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(OrderNotFoundError);
  });

  it("key ausente, de outro kit ou trocada lança antes de tocar o banco", async () => {
    const processingOrder = await insertOrder("processing");
    const valid = buildPublishKitInput(processingOrder.orderId);
    const otherKitId = crypto.randomUUID();
    for (const overrides of [
      { answerKeyStorageKey: "" },
      {
        activitiesStorageKey: kitStorageKey(processingOrder.orderId, otherKitId, "activities"),
      },
      {
        activitiesStorageKey: valid.answerKeyStorageKey,
        answerKeyStorageKey: valid.activitiesStorageKey,
      },
    ]) {
      await expect(publish({ ...valid, ...overrides })).rejects.toBeInstanceOf(ZodError);
    }
    await expectNothingPublished(processingOrder.orderId, "processing");
  });

  it("transação que falha depois de publicar desfaz kit, estado e job", async () => {
    const processingOrder = await insertOrder("processing");
    await expect(
      testDatabase.db.transaction(async (tx) => {
        const result = await publishKit(tx, buildPublishKitInput(processingOrder.orderId));
        expect(result.ok).toBe(true);
        throw new Error("rollback on purpose");
      }),
    ).rejects.toThrow("rollback on purpose");
    await expectNothingPublished(processingOrder.orderId, "processing");
  });
});

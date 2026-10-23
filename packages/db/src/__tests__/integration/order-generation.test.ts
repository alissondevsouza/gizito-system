import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { InvalidTransitionError, type OrderStatus } from "@gizito/core";
import { eq } from "drizzle-orm";
import {
  buildAiCallInsert,
  buildOrderInsert,
  buildPreviewReadyAnalysis,
} from "#src/__tests__/integration/helpers.ts";
import { OrderNotFoundError } from "#src/order/errors.ts";
import {
  failOrderGeneration,
  startOrderGeneration,
  sumOrderAiCostCents,
} from "#src/order/generation.ts";
import { aiCall, job, order } from "#src/schema/index.ts";
import {
  createTestDatabase,
  type TestDatabase,
  truncateAllTables,
} from "#src/test-helpers/index.ts";

const MISSING_ORDER_ID = "99999999-9999-4999-8999-999999999999";
const FRACTIONS_TOPIC_ID = "ma5-fractions";

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

const previewAnalysis = buildPreviewReadyAnalysis("77777777-7777-4777-8777-777777777777");
const materialProfile =
  previewAnalysis.outcome === "preview_ready"
    ? previewAnalysis.mergedExtraction.materialProfile
    : null;

async function insertOrder(
  status: OrderStatus,
  overrides: Partial<typeof order.$inferInsert> = {},
) {
  const [row] = await testDatabase.db
    .insert(order)
    .values(
      buildOrderInsert({
        status,
        email: "responsavel@example.com",
        topicIdList: [FRACTIONS_TOPIC_ID],
        otherTopicText: "problemas com troco",
        perceivedDifficulty: "basic",
        noteText: "confunde numerador",
        materialProfile,
        analysis: previewAnalysis,
        ...overrides,
      }),
    )
    .returning();
  if (!row) throw new Error("insert returned no row");
  return row;
}

async function loadOrder(orderId: string) {
  const [row] = await testDatabase.db.select().from(order).where(eq(order.orderId, orderId));
  if (!row) throw new Error("order not found");
  return row;
}

function start(orderId: string) {
  return testDatabase.db.transaction((tx) => startOrderGeneration(tx, orderId));
}

function fail(orderId: string, failReasonCode = "generation_blocked") {
  return testDatabase.db.transaction((tx) => failOrderGeneration(tx, { orderId, failReasonCode }));
}

describe("startOrderGeneration (spec F2-05, RF-04)", () => {
  it("paid vira processing, limpa fail_reason_code e devolve os campos da geração", async () => {
    const paidOrder = await insertOrder("paid", { failReasonCode: "render_failed" });
    const result = await start(paidOrder.orderId);
    if (!result.ok) throw result.error;
    expect(result.value.decision).toBe("start");
    if (result.value.decision === "skip") return;
    expect(result.value.fields).toEqual({
      grade: "5",
      subject: "math",
      topicIdList: [FRACTIONS_TOPIC_ID],
      otherTopicText: "problemas com troco",
      perceivedDifficulty: "basic",
      noteText: "confunde numerador",
      materialProfile,
      analysis: previewAnalysis,
    });
    const reloaded = await loadOrder(paidOrder.orderId);
    expect(reloaded.status).toBe("processing");
    expect(reloaded.failReasonCode).toBeNull();
  });

  it("processing retoma sem escrita", async () => {
    const processingOrder = await insertOrder("processing");
    const before = await loadOrder(processingOrder.orderId);
    const result = await start(processingOrder.orderId);
    if (!result.ok) throw result.error;
    expect(result.value.decision).toBe("resume");
    if (result.value.decision === "skip") return;
    expect(result.value.fields.topicIdList).toEqual([FRACTIONS_TOPIC_ID]);
    const after = await loadOrder(processingOrder.orderId);
    expect(after).toEqual(before);
  });

  it.each(["ready", "failed", "awaiting_payment", "refunded"] as const)(
    "%s pula sem escrita",
    async (status) => {
      const skippedOrder = await insertOrder(status);
      const before = await loadOrder(skippedOrder.orderId);
      const result = await start(skippedOrder.orderId);
      if (!result.ok) throw result.error;
      expect(result.value).toEqual({ decision: "skip", status });
      expect(await loadOrder(skippedOrder.orderId)).toEqual(before);
    },
  );

  it("pedido inexistente devolve OrderNotFoundError", async () => {
    const result = await start(MISSING_ORDER_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(OrderNotFoundError);
  });
});

describe("failOrderGeneration (spec F2-05, RF-05)", () => {
  it.each(["paid", "processing"] as const)(
    "%s vira failed com o código e enfileira kit_failed",
    async (status) => {
      const failingOrder = await insertOrder(status);
      const result = await fail(failingOrder.orderId, "ai_cost_exceeded");
      if (!result.ok) throw result.error;
      expect(result.value.status).toBe("failed");
      const reloaded = await loadOrder(failingOrder.orderId);
      expect(reloaded.status).toBe("failed");
      expect(reloaded.failReasonCode).toBe("ai_cost_exceeded");
      const [notifyJob] = await testDatabase.db
        .select()
        .from(job)
        .where(eq(job.jobId, result.value.notifyJobId));
      expect(notifyJob).toMatchObject({
        name: "order.notify",
        status: "pending",
        payload: { name: "order.notify", orderId: failingOrder.orderId, kind: "kit_failed" },
      });
    },
  );

  it.each(["ready", "refunded", "awaiting_payment"] as const)(
    "%s recusa com InvalidTransitionError sem escrita nem job",
    async (status) => {
      const untouchedOrder = await insertOrder(status);
      const result = await fail(untouchedOrder.orderId);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(InvalidTransitionError);
      const reloaded = await loadOrder(untouchedOrder.orderId);
      expect(reloaded.status).toBe(status);
      expect(reloaded.failReasonCode).toBeNull();
      expect(await testDatabase.db.$count(job)).toBe(0);
    },
  );

  it("pedido inexistente devolve OrderNotFoundError", async () => {
    const result = await fail(MISSING_ORDER_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(OrderNotFoundError);
  });
});

describe("sumOrderAiCostCents (spec F2-05, RF-06)", () => {
  it("sem chamadas é zero", async () => {
    const emptyOrder = await insertOrder("paid");
    expect(await sumOrderAiCostCents(testDatabase.db, emptyOrder.orderId)).toBe(0);
  });

  it("soma as chamadas do pedido, da extração e da geração, e ignora as de outros pedidos", async () => {
    const costedOrder = await insertOrder("processing");
    const otherOrder = await insertOrder("processing");
    await testDatabase.db.insert(aiCall).values([
      buildAiCallInsert(costedOrder.orderId, { costCents: 0.25 }),
      buildAiCallInsert(costedOrder.orderId, { stage: "plan", costCents: 3.5 }),
      buildAiCallInsert(costedOrder.orderId, {
        stage: "generate",
        costCents: 20.125,
        outcomeCode: "ai_output_invalid",
      }),
      buildAiCallInsert(otherOrder.orderId, { costCents: 99 }),
    ]);
    expect(await sumOrderAiCostCents(testDatabase.db, costedOrder.orderId)).toBeCloseTo(23.875, 6);
  });
});

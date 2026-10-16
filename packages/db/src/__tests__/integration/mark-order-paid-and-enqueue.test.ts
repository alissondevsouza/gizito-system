import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  ChargePaymentMismatchError,
  InvalidTransitionError,
  type MarkOrderPaidInput,
  type OrderStatus,
} from "@gizito/core";
import { eq } from "drizzle-orm";
import { ZodError } from "zod";
import {
  buildChargeInsert,
  buildOrderInsert,
  FIXED_DATETIME,
} from "#src/__tests__/integration/helpers.ts";
import { createDatabase } from "#src/client.ts";
import {
  ChargeNotFoundError,
  GatewayPaymentInUseError,
  markOrderPaidAndEnqueue,
  OrderNotFoundError,
  WebhookEventNotFoundError,
} from "#src/order/index.ts";
import { charge, job, order, supportTicket, webhookEvent } from "#src/schema/index.ts";
import {
  createTestDatabase,
  resolveTestDatabaseUrl,
  type TestDatabase,
  truncateAllTables,
  withDatabaseName,
} from "#src/test-helpers/index.ts";

const PAID_DATETIME = new Date(FIXED_DATETIME.getTime() + 5 * 60_000);
const PROCESSED_DATETIME = new Date(FIXED_DATETIME.getTime() + 6 * 60_000);

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

async function insertCharge(orderId: string, overrides: Partial<typeof charge.$inferInsert> = {}) {
  const [row] = await testDatabase.db
    .insert(charge)
    .values(buildChargeInsert(orderId, overrides))
    .returning();
  if (!row) throw new Error("insert returned no row");
  return row;
}

async function insertWebhookEvent(externalId: string) {
  const [row] = await testDatabase.db
    .insert(webhookEvent)
    .values({ source: "mercadopago", externalId })
    .returning();
  if (!row) throw new Error("insert returned no row");
  return row;
}

async function awaitingPaymentFixture() {
  const pendingOrder = await insertOrder("awaiting_payment");
  const pendingCharge = await insertCharge(pendingOrder.orderId, { gatewayPaymentId: "pay-1" });
  return { pendingOrder, pendingCharge };
}

function markPaid(input: MarkOrderPaidInput) {
  return testDatabase.db.transaction((tx) =>
    markOrderPaidAndEnqueue(tx, input, { now: PROCESSED_DATETIME }),
  );
}

async function loadOrder(orderId: string) {
  const [row] = await testDatabase.db.select().from(order).where(eq(order.orderId, orderId));
  return row;
}

async function loadCharge(chargeId: string) {
  const [row] = await testDatabase.db.select().from(charge).where(eq(charge.chargeId, chargeId));
  return row;
}

async function countGenerateJob(orderId: string) {
  const rowList = await testDatabase.db
    .select({ payload: job.payload })
    .from(job)
    .where(eq(job.name, "order.generate"));
  return rowList.filter((row) => JSON.stringify(row.payload).includes(orderId)).length;
}

describe("markOrderPaidAndEnqueue: confirmação", () => {
  it("awaiting_payment vira paid, cobrança paga, demais pendentes expiram e order.generate entra", async () => {
    const { pendingOrder, pendingCharge } = await awaitingPaymentFixture();
    const otherPending = await insertCharge(pendingOrder.orderId);
    const alreadyExpired = await insertCharge(pendingOrder.orderId, { status: "expired" });
    const otherOrder = await insertOrder("awaiting_payment");
    const otherOrderCharge = await insertCharge(otherOrder.orderId);
    const event = await insertWebhookEvent("evt-1");

    const result = await markPaid({
      orderId: pendingOrder.orderId,
      chargeId: pendingCharge.chargeId,
      gatewayPaymentId: "pay-1",
      paidDatetime: PAID_DATETIME,
      webhookEventId: event.webhookEventId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.value.outcome !== "paid") throw new Error("expected paid");
    const reloadedOrder = await loadOrder(pendingOrder.orderId);
    expect(reloadedOrder?.status).toBe("paid");
    expect(reloadedOrder?.paidDatetime).toEqual(PAID_DATETIME);
    const reloadedCharge = await loadCharge(pendingCharge.chargeId);
    expect(reloadedCharge).toMatchObject({
      status: "paid",
      gatewayPaymentId: "pay-1",
      paidDatetime: PAID_DATETIME,
    });
    expect((await loadCharge(otherPending.chargeId))?.status).toBe("expired");
    expect((await loadCharge(alreadyExpired.chargeId))?.status).toBe("expired");
    expect((await loadCharge(otherOrderCharge.chargeId))?.status).toBe("pending");
    const [generateJob] = await testDatabase.db
      .select()
      .from(job)
      .where(eq(job.jobId, result.value.generateJobId));
    expect(generateJob).toMatchObject({
      name: "order.generate",
      status: "pending",
      payload: { name: "order.generate", orderId: pendingOrder.orderId },
    });
    const [reloadedEvent] = await testDatabase.db
      .select()
      .from(webhookEvent)
      .where(eq(webhookEvent.webhookEventId, event.webhookEventId));
    expect(reloadedEvent).toMatchObject({
      processedDatetime: PROCESSED_DATETIME,
      outcomeCode: "paid",
    });
  });

  it("repetição com o mesmo pagamento é no-op: um job só, webhook marcado already_paid", async () => {
    const { pendingOrder, pendingCharge } = await awaitingPaymentFixture();
    const input = {
      orderId: pendingOrder.orderId,
      chargeId: pendingCharge.chargeId,
      gatewayPaymentId: "pay-1",
      paidDatetime: PAID_DATETIME,
    };
    await markPaid(input);
    const repeatedEvent = await insertWebhookEvent("evt-repeated");
    const repeated = await markPaid({ ...input, webhookEventId: repeatedEvent.webhookEventId });
    expect(repeated).toEqual({ ok: true, value: { outcome: "already_paid" } });
    expect(await countGenerateJob(pendingOrder.orderId)).toBe(1);
    expect((await loadOrder(pendingOrder.orderId))?.status).toBe("paid");
    const [reloadedEvent] = await testDatabase.db
      .select()
      .from(webhookEvent)
      .where(eq(webhookEvent.webhookEventId, repeatedEvent.webhookEventId));
    expect(reloadedEvent?.outcomeCode).toBe("already_paid");
  });

  it("cobrança sem gateway_payment_id prévio recebe o id do pagamento", async () => {
    const pendingOrder = await insertOrder("awaiting_payment");
    const pendingCharge = await insertCharge(pendingOrder.orderId);
    const result = await markPaid({
      orderId: pendingOrder.orderId,
      chargeId: pendingCharge.chargeId,
      gatewayPaymentId: "pay-9",
      paidDatetime: PAID_DATETIME,
    });
    expect(result.ok && result.value.outcome).toBe("paid");
    expect((await loadCharge(pendingCharge.chargeId))?.gatewayPaymentId).toBe("pay-9");
  });

  it("Pix pago depois da cobrança expirar ainda vale e expira o Pix novo pendente", async () => {
    const pendingOrder = await insertOrder("awaiting_payment");
    const expiredCharge = await insertCharge(pendingOrder.orderId, {
      status: "expired",
      gatewayPaymentId: "pay-old",
    });
    const newCharge = await insertCharge(pendingOrder.orderId, { gatewayPaymentId: "pay-new" });
    const result = await markPaid({
      orderId: pendingOrder.orderId,
      chargeId: expiredCharge.chargeId,
      gatewayPaymentId: "pay-old",
      paidDatetime: PAID_DATETIME,
    });
    expect(result.ok && result.value.outcome).toBe("paid");
    expect((await loadCharge(expiredCharge.chargeId))?.status).toBe("paid");
    expect((await loadCharge(newCharge.chargeId))?.status).toBe("expired");
    expect((await loadOrder(pendingOrder.orderId))?.status).toBe("paid");
  });

  it("confirmações concorrentes do mesmo pagamento geram um job só", async () => {
    const { pendingOrder, pendingCharge } = await awaitingPaymentFixture();
    const concurrentHandle = createDatabase({
      databaseUrl: withDatabaseName(resolveTestDatabaseUrl(), testDatabase.databaseName),
      maxConnections: 4,
    });
    try {
      const input = {
        orderId: pendingOrder.orderId,
        chargeId: pendingCharge.chargeId,
        gatewayPaymentId: "pay-1",
        paidDatetime: PAID_DATETIME,
      };
      const resultList = await Promise.all(
        Array.from({ length: 4 }, () =>
          concurrentHandle.db.transaction((tx) => markOrderPaidAndEnqueue(tx, input)),
        ),
      );
      const outcomeList = resultList.map((result) => (result.ok ? result.value.outcome : "error"));
      expect(outcomeList.sort()).toEqual(["already_paid", "already_paid", "already_paid", "paid"]);
    } finally {
      await concurrentHandle.close();
    }
    expect(await countGenerateJob(pendingOrder.orderId)).toBe(1);
  });
});

describe("markOrderPaidAndEnqueue: pagamento duplicado", () => {
  it("Pix antigo e Pix novo do mesmo pedido confirmados juntos: um paid, um duplicado, sem deadlock", async () => {
    const pendingOrder = await insertOrder("awaiting_payment");
    const oldCharge = await insertCharge(pendingOrder.orderId, { gatewayPaymentId: "pay-old" });
    const newCharge = await insertCharge(pendingOrder.orderId, { gatewayPaymentId: "pay-new" });
    const concurrentHandle = createDatabase({
      databaseUrl: withDatabaseName(resolveTestDatabaseUrl(), testDatabase.databaseName),
      maxConnections: 2,
    });
    try {
      const resultList = await Promise.all(
        [
          { chargeId: oldCharge.chargeId, gatewayPaymentId: "pay-old" },
          { chargeId: newCharge.chargeId, gatewayPaymentId: "pay-new" },
        ].map((payment) =>
          concurrentHandle.db.transaction((tx) =>
            markOrderPaidAndEnqueue(tx, {
              ...payment,
              orderId: pendingOrder.orderId,
              paidDatetime: PAID_DATETIME,
            }),
          ),
        ),
      );
      const outcomeList = resultList.map((result) => (result.ok ? result.value.outcome : "error"));
      expect(outcomeList.sort()).toEqual(["duplicate_payment", "paid"]);
    } finally {
      await concurrentHandle.close();
    }
    expect((await loadOrder(pendingOrder.orderId))?.status).toBe("paid");
    expect((await loadCharge(oldCharge.chargeId))?.status).toBe("paid");
    expect((await loadCharge(newCharge.chargeId))?.status).toBe("paid");
    expect(await countGenerateJob(pendingOrder.orderId)).toBe(1);
    expect(
      await testDatabase.db.$count(supportTicket, eq(supportTicket.orderId, pendingOrder.orderId)),
    ).toBe(1);
  });

  it("outra cobrança paga com o pedido já pago: cobrança registrada, ticket aberto, estado mantido", async () => {
    const { pendingOrder, pendingCharge } = await awaitingPaymentFixture();
    const secondCharge = await insertCharge(pendingOrder.orderId, { gatewayPaymentId: "pay-2" });
    await markPaid({
      orderId: pendingOrder.orderId,
      chargeId: pendingCharge.chargeId,
      gatewayPaymentId: "pay-1",
      paidDatetime: PAID_DATETIME,
    });
    const event = await insertWebhookEvent("evt-duplicate");
    const duplicateInput = {
      orderId: pendingOrder.orderId,
      chargeId: secondCharge.chargeId,
      gatewayPaymentId: "pay-2",
      paidDatetime: PAID_DATETIME,
      webhookEventId: event.webhookEventId,
    };
    const result = await markPaid(duplicateInput);
    if (!result.ok || result.value.outcome !== "duplicate_payment") {
      throw new Error("expected duplicate_payment");
    }
    expect((await loadCharge(secondCharge.chargeId))?.status).toBe("paid");
    expect((await loadOrder(pendingOrder.orderId))?.status).toBe("paid");
    const ticketList = await testDatabase.db
      .select()
      .from(supportTicket)
      .where(eq(supportTicket.orderId, pendingOrder.orderId));
    expect(ticketList).toHaveLength(1);
    expect(ticketList[0]).toMatchObject({
      supportTicketId: result.value.supportTicketId,
      kind: "duplicate_payment",
      status: "open",
    });
    expect(ticketList[0]?.noteText).toContain(secondCharge.chargeId);
    expect(await countGenerateJob(pendingOrder.orderId)).toBe(1);
    const [reloadedEvent] = await testDatabase.db
      .select()
      .from(webhookEvent)
      .where(eq(webhookEvent.webhookEventId, event.webhookEventId));
    expect(reloadedEvent?.outcomeCode).toBe("duplicate_payment");

    const repeated = await markPaid({ ...duplicateInput, webhookEventId: undefined });
    expect(repeated).toEqual({ ok: true, value: { outcome: "already_paid" } });
    expect(
      await testDatabase.db.$count(supportTicket, eq(supportTicket.orderId, pendingOrder.orderId)),
    ).toBe(1);
  });

  it.each(["processing", "ready", "failed", "refunded"] as const)(
    "pedido em %s com nova cobrança paga também abre ticket",
    async (status) => {
      const paidOrder = await insertOrder(status);
      const lateCharge = await insertCharge(paidOrder.orderId, { status: "expired" });
      const result = await markPaid({
        orderId: paidOrder.orderId,
        chargeId: lateCharge.chargeId,
        gatewayPaymentId: `pay-${status}`,
        paidDatetime: PAID_DATETIME,
      });
      expect(result.ok && result.value.outcome).toBe("duplicate_payment");
      expect((await loadOrder(paidOrder.orderId))?.status).toBe(status);
      expect(await countGenerateJob(paidOrder.orderId)).toBe(0);
    },
  );
});

describe("markOrderPaidAndEnqueue: erros, sem escrita", () => {
  async function expectNothingWritten(orderId: string, chargeId: string, status: OrderStatus) {
    expect((await loadOrder(orderId))?.status).toBe(status);
    expect((await loadCharge(chargeId))?.status).toBe("pending");
    expect(await testDatabase.db.$count(job)).toBe(0);
    expect(await testDatabase.db.$count(supportTicket)).toBe(0);
  }

  it("pedido antes de awaiting_payment devolve InvalidTransitionError", async () => {
    const draftOrder = await insertOrder("preview_ready");
    const pendingCharge = await insertCharge(draftOrder.orderId);
    const result = await markPaid({
      orderId: draftOrder.orderId,
      chargeId: pendingCharge.chargeId,
      gatewayPaymentId: "pay-1",
      paidDatetime: PAID_DATETIME,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(InvalidTransitionError);
    await expectNothingWritten(draftOrder.orderId, pendingCharge.chargeId, "preview_ready");
  });

  it("pedido inexistente, cobrança de outro pedido e webhook inexistente devolvem erro tipado", async () => {
    const { pendingOrder, pendingCharge } = await awaitingPaymentFixture();
    const otherOrder = await insertOrder("awaiting_payment");
    const otherCharge = await insertCharge(otherOrder.orderId);
    const base = {
      orderId: pendingOrder.orderId,
      chargeId: pendingCharge.chargeId,
      gatewayPaymentId: "pay-1",
      paidDatetime: PAID_DATETIME,
    };
    const caseList = [
      [{ ...base, orderId: crypto.randomUUID() }, OrderNotFoundError],
      [{ ...base, chargeId: otherCharge.chargeId }, ChargeNotFoundError],
      [{ ...base, webhookEventId: crypto.randomUUID() }, WebhookEventNotFoundError],
    ] as const;
    for (const [input, errorClass] of caseList) {
      const result = await markPaid(input);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error).toBeInstanceOf(errorClass);
    }
    await expectNothingWritten(pendingOrder.orderId, pendingCharge.chargeId, "awaiting_payment");
  });

  it("cobrança ligada a outro pagamento devolve ChargePaymentMismatchError", async () => {
    const { pendingOrder, pendingCharge } = await awaitingPaymentFixture();
    const result = await markPaid({
      orderId: pendingOrder.orderId,
      chargeId: pendingCharge.chargeId,
      gatewayPaymentId: "pay-other",
      paidDatetime: PAID_DATETIME,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ChargePaymentMismatchError);
    await expectNothingWritten(pendingOrder.orderId, pendingCharge.chargeId, "awaiting_payment");
  });

  it("pagamento já ligado a outra cobrança devolve GatewayPaymentInUseError", async () => {
    const { pendingOrder, pendingCharge } = await awaitingPaymentFixture();
    const otherOrder = await insertOrder("paid");
    await insertCharge(otherOrder.orderId, { status: "paid", gatewayPaymentId: "pay-taken" });
    const freeCharge = await insertCharge(pendingOrder.orderId);
    const result = await markPaid({
      orderId: pendingOrder.orderId,
      chargeId: freeCharge.chargeId,
      gatewayPaymentId: "pay-taken",
      paidDatetime: PAID_DATETIME,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(GatewayPaymentInUseError);
    await expectNothingWritten(pendingOrder.orderId, pendingCharge.chargeId, "awaiting_payment");
    expect((await loadCharge(freeCharge.chargeId))?.status).toBe("pending");
  });

  it("entrada inválida lança antes de tocar o banco", async () => {
    const { pendingOrder, pendingCharge } = await awaitingPaymentFixture();
    await expect(
      markPaid({
        orderId: "not-a-guid",
        chargeId: pendingCharge.chargeId,
        gatewayPaymentId: "pay-1",
        paidDatetime: PAID_DATETIME,
      }),
    ).rejects.toBeInstanceOf(ZodError);
    await expectNothingWritten(pendingOrder.orderId, pendingCharge.chargeId, "awaiting_payment");
  });

  it("transação que falha depois da confirmação desfaz estado, cobrança e job", async () => {
    const { pendingOrder, pendingCharge } = await awaitingPaymentFixture();
    await expect(
      testDatabase.db.transaction(async (tx) => {
        const result = await markOrderPaidAndEnqueue(tx, {
          orderId: pendingOrder.orderId,
          chargeId: pendingCharge.chargeId,
          gatewayPaymentId: "pay-1",
          paidDatetime: PAID_DATETIME,
        });
        expect(result.ok).toBe(true);
        throw new Error("rollback on purpose");
      }),
    ).rejects.toThrow("rollback on purpose");
    await expectNothingWritten(pendingOrder.orderId, pendingCharge.chargeId, "awaiting_payment");
  });
});

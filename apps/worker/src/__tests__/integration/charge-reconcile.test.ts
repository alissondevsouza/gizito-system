import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { randomBytes } from "node:crypto";
import {
  buildPublicToken,
  buildShortCode,
  CHARGE_RECONCILE_AFTER_EXPIRY_MINUTES,
  type ChargeStatus,
  chargeExpireDatetime,
  JOB_MAX_ATTEMPT_COUNT,
  type JobPayloadByName,
  KIT_PRICE_CENTS,
  type OrderStatus,
  PUBLIC_TOKEN_BYTES,
  SHORT_CODE_LENGTH,
} from "@gizito/core";
import { charge, enqueueJob, job, order, supportTicket, webhookEvent, workJob } from "@gizito/db";
import { createTestDatabase, type TestDatabase, truncateAllTables } from "@gizito/db/test-helpers";
import {
  createFakePaymentGateway,
  createMemoryLogger,
  type FakePaymentGateway,
} from "@gizito/integrations/fakes";
import { and, asc, eq } from "drizzle-orm";
import {
  CANCEL_FAILED_ERROR_CODE,
  CHARGE_RECONCILE_SCAN_LOG_MESSAGE,
  CHARGE_RECONCILED_LOG_MESSAGE,
  createChargeReconcileJob,
} from "#src/jobs/charge-reconcile.ts";
import type { JobDefinition } from "#src/runner/lanes.ts";

const WORKER_ID = "worker-test";
const START = new Date("2026-10-22T12:10:00.000Z");
const PAYER_EMAIL = "mae.da.ana@example.com";
const MILLISECONDS_PER_MINUTE = 60_000;
const WARN_LEVEL = 40;
const ERROR_LEVEL = 50;

type Harness = {
  readonly gateway: FakePaymentGateway;
  readonly memoryLogger: ReturnType<typeof createMemoryLogger>;
  readonly definition: JobDefinition;
  setTime: (time: Date) => void;
};

type ReconcilePayload = Omit<JobPayloadByName<"charge.reconcile">, "name">;

let testDatabase: TestDatabase;
let harness: Harness;

beforeAll(async () => {
  testDatabase = await createTestDatabase();
});

afterAll(async () => {
  await testDatabase.destroy();
});

beforeEach(async () => {
  await truncateAllTables(testDatabase.db);
  let currentTime = START;
  const now = () => currentTime;
  const gateway = createFakePaymentGateway({ now });
  const memoryLogger = createMemoryLogger({ level: "info" });
  harness = {
    gateway,
    memoryLogger,
    definition: createChargeReconcileJob({
      db: testDatabase.db,
      paymentGateway: gateway,
      logger: memoryLogger.logger,
      now,
    }),
    setTime: (time) => {
      currentTime = time;
    },
  };
});

function minutesBefore(minutes: number): Date {
  return new Date(START.getTime() - minutes * MILLISECONDS_PER_MINUTE);
}

async function createOrder(status: OrderStatus = "awaiting_payment"): Promise<string> {
  const [row] = await testDatabase.db
    .insert(order)
    .values({
      publicToken: buildPublicToken(new Uint8Array(randomBytes(PUBLIC_TOKEN_BYTES))),
      shortCode: buildShortCode(new Uint8Array(randomBytes(SHORT_CODE_LENGTH))),
      status,
      grade: "5",
      subject: "math",
      email: PAYER_EMAIL,
      topicIdList: ["ma5-fractions"],
    })
    .returning({ orderId: order.orderId });
  if (!row) throw new Error("pedido não gravado");
  return row.orderId;
}

type ChargeOptions = {
  readonly ageMinutes?: number;
  readonly amountCents?: number;
  readonly status?: ChargeStatus;
  readonly gatewayOrderRef?: string;
  readonly withGatewayPaymentId?: boolean;
};

async function createCharge(
  orderId: string,
  {
    ageMinutes = 5,
    amountCents = KIT_PRICE_CENTS,
    status = "pending",
    gatewayOrderRef = orderId,
    withGatewayPaymentId = true,
  }: ChargeOptions = {},
) {
  const chargeId = crypto.randomUUID();
  const insertDatetime = minutesBefore(ageMinutes);
  const expireDatetime = chargeExpireDatetime(insertDatetime);
  const created = await harness.gateway.createCharge({
    chargeId,
    orderId: gatewayOrderRef,
    amountCents: KIT_PRICE_CENTS,
    payerEmail: PAYER_EMAIL,
    expireDatetime,
  });
  await testDatabase.db.insert(charge).values({
    chargeId,
    orderId,
    gateway: "fake",
    gatewayOrderId: created.gatewayOrderId,
    gatewayPaymentId: withGatewayPaymentId ? created.gatewayPaymentId : null,
    amountCents,
    status,
    qrCode: created.qrCode,
    qrCodeBase64: created.qrCodeBase64,
    expireDatetime,
    insertDatetime,
  });
  return {
    chargeId,
    gatewayOrderId: created.gatewayOrderId,
    gatewayPaymentId: created.gatewayPaymentId ?? "",
    expireDatetime,
    qrCode: created.qrCode,
  };
}

async function insertWebhookEvent(): Promise<string> {
  const [row] = await testDatabase.db
    .insert(webhookEvent)
    .values({ source: "mercadopago", externalId: `evt-${crypto.randomUUID()}` })
    .returning({ webhookEventId: webhookEvent.webhookEventId });
  if (!row) throw new Error("evento não gravado");
  return row.webhookEventId;
}

async function runReconcile(
  payload: ReconcilePayload,
  { maxAttemptCount }: { maxAttemptCount?: number } = {},
) {
  await enqueueJob(
    testDatabase.db,
    { name: "charge.reconcile", ...payload },
    { maxAttemptCount, runAfterDatetime: START },
  );
  return workJob(testDatabase.db, {
    nameList: ["charge.reconcile"],
    workerId: WORKER_ID,
    clock: () => START,
    handler: harness.definition.handle,
    onExhausted: harness.definition.onExhausted,
  });
}

async function loadOrder(orderId: string) {
  const [row] = await testDatabase.db.select().from(order).where(eq(order.orderId, orderId));
  if (!row) throw new Error("pedido sumiu");
  return row;
}

async function loadCharge(chargeId: string) {
  const [row] = await testDatabase.db.select().from(charge).where(eq(charge.chargeId, chargeId));
  if (!row) throw new Error("cobrança sumiu");
  return row;
}

async function loadWebhookEvent(webhookEventId: string) {
  const [row] = await testDatabase.db
    .select()
    .from(webhookEvent)
    .where(eq(webhookEvent.webhookEventId, webhookEventId));
  if (!row) throw new Error("evento sumiu");
  return row;
}

async function listJobs(name: "order.generate" | "charge.reconcile") {
  return testDatabase.db
    .select()
    .from(job)
    .where(eq(job.name, name))
    .orderBy(asc(job.insertDatetime), asc(job.jobId));
}

function reconciledEntryList() {
  return harness.memoryLogger
    .readEntryList()
    .filter((entry) => entry.msg === CHARGE_RECONCILED_LOG_MESSAGE);
}

describe("charge.reconcile dirigido pelo webhook (spec F2-04, RF-10)", () => {
  it("pago no gateway: pedido paid, cobrança paga, order.generate, evento processado, pix antigo expirado e cancelado, conferência agendada", async () => {
    const orderId = await createOrder();
    const oldCharge = await createCharge(orderId, { ageMinutes: 40 });
    const newCharge = await createCharge(orderId, { ageMinutes: 3 });
    const paidDatetime = minutesBefore(1);
    harness.gateway.markPaid(newCharge.chargeId, paidDatetime);
    const webhookEventId = await insertWebhookEvent();

    const outcome = await runReconcile({ orderId, chargeId: newCharge.chargeId, webhookEventId });
    expect(outcome).toMatchObject({ outcome: "completed", errorCode: null });

    expect(await loadOrder(orderId)).toMatchObject({ status: "paid", paidDatetime });
    expect(await loadCharge(newCharge.chargeId)).toMatchObject({
      status: "paid",
      gatewayPaymentId: newCharge.gatewayPaymentId,
      paidDatetime,
    });
    expect((await loadCharge(oldCharge.chargeId)).status).toBe("expired");
    expect((await listJobs("order.generate")).map((row) => row.payload)).toEqual([
      { name: "order.generate", orderId },
    ]);
    expect(await loadWebhookEvent(webhookEventId)).toMatchObject({
      processedDatetime: START,
      outcomeCode: "paid",
    });
    expect(harness.gateway.cancelReferenceList).toEqual([
      {
        chargeId: oldCharge.chargeId,
        gatewayOrderId: oldCharge.gatewayOrderId,
        gatewayPaymentId: oldCharge.gatewayPaymentId,
      },
    ]);
    expect((await harness.gateway.getChargeStatus(oldCharge)).status).toBe("expired");
    const followUpList = (await listJobs("charge.reconcile")).filter(
      (row) => row.status === "pending",
    );
    expect(followUpList.map((row) => row.payload)).toEqual([
      { name: "charge.reconcile", orderId, chargeId: oldCharge.chargeId },
    ]);
    expect(followUpList[0]?.runAfterDatetime).toEqual(
      new Date(
        oldCharge.expireDatetime.getTime() +
          CHARGE_RECONCILE_AFTER_EXPIRY_MINUTES * MILLISECONDS_PER_MINUTE,
      ),
    );
    expect(reconciledEntryList()).toEqual([
      expect.objectContaining({
        level: 30,
        orderId,
        chargeId: newCharge.chargeId,
        webhookEventId,
        stage: "reconcile",
        outcome: "paid",
        gatewayStatus: "paid",
      }),
    ]);
  });

  it("o mesmo job de novo é already_paid: um order.generate só e nenhum cancelamento a mais", async () => {
    const orderId = await createOrder();
    await createCharge(orderId, { ageMinutes: 20 });
    const newCharge = await createCharge(orderId, { ageMinutes: 3 });
    harness.gateway.markPaid(newCharge.chargeId, START);
    const webhookEventId = await insertWebhookEvent();
    const payload = { orderId, chargeId: newCharge.chargeId, webhookEventId };
    await runReconcile(payload);
    const repeated = await runReconcile(payload);
    expect(repeated).toMatchObject({ outcome: "completed" });
    expect(await listJobs("order.generate")).toHaveLength(1);
    expect(harness.gateway.cancelReferenceList).toHaveLength(1);
    expect((await loadWebhookEvent(webhookEventId)).outcomeCode).toBe("already_paid");
    expect(reconciledEntryList().map((entry) => entry.outcome)).toEqual(["paid", "already_paid"]);
  });

  it("pendente no gateway não muda nada e marca o evento como pending", async () => {
    const orderId = await createOrder();
    const pending = await createCharge(orderId);
    const webhookEventId = await insertWebhookEvent();
    expect(
      await runReconcile({ orderId, chargeId: pending.chargeId, webhookEventId }),
    ).toMatchObject({ outcome: "completed" });
    expect((await loadOrder(orderId)).status).toBe("awaiting_payment");
    expect((await loadCharge(pending.chargeId)).status).toBe("pending");
    expect(await loadWebhookEvent(webhookEventId)).toMatchObject({
      processedDatetime: START,
      outcomeCode: "pending",
    });
    expect(await listJobs("order.generate")).toEqual([]);
  });

  it.each([
    ["antes", 5],
    ["depois", 40],
  ])(
    "expirado no gateway %s do vencimento: cobrança expired, pedido continua aguardando, evento expired",
    async (_label, ageMinutes) => {
      const orderId = await createOrder();
      const expired = await createCharge(orderId, { ageMinutes });
      harness.gateway.markExpired(expired.chargeId);
      const webhookEventId = await insertWebhookEvent();
      expect(
        await runReconcile({ orderId, chargeId: expired.chargeId, webhookEventId }),
      ).toMatchObject({ outcome: "completed" });
      expect((await loadCharge(expired.chargeId)).status).toBe("expired");
      expect((await loadOrder(orderId)).status).toBe("awaiting_payment");
      expect((await loadWebhookEvent(webhookEventId)).outcomeCode).toBe("expired");
    },
  );

  it("pix antigo pago com o pedido já pago: duplicate_payment com ticket, alerta e estado mantido", async () => {
    const orderId = await createOrder();
    const oldCharge = await createCharge(orderId, { ageMinutes: 20 });
    const newCharge = await createCharge(orderId, { ageMinutes: 3 });
    harness.gateway.markPaid(newCharge.chargeId, START);
    await runReconcile({ orderId, chargeId: newCharge.chargeId });
    harness.gateway.markPaid(oldCharge.chargeId, START);
    const webhookEventId = await insertWebhookEvent();
    expect(
      await runReconcile({ orderId, chargeId: oldCharge.chargeId, webhookEventId }),
    ).toMatchObject({ outcome: "completed" });
    expect((await loadOrder(orderId)).status).toBe("paid");
    expect((await loadCharge(oldCharge.chargeId)).status).toBe("paid");
    expect(await listJobs("order.generate")).toHaveLength(1);
    expect(
      await testDatabase.db.$count(
        supportTicket,
        and(eq(supportTicket.orderId, orderId), eq(supportTicket.kind, "duplicate_payment")),
      ),
    ).toBe(1);
    expect((await loadWebhookEvent(webhookEventId)).outcomeCode).toBe("duplicate_payment");
    expect(reconciledEntryList().at(-1)).toMatchObject({
      level: ERROR_LEVEL,
      outcome: "duplicate_payment",
    });
  });

  it("a conferência agendada da cobrança antiga pega o pagamento em dobro sem webhook", async () => {
    const orderId = await createOrder();
    const oldCharge = await createCharge(orderId, { ageMinutes: 40 });
    const newCharge = await createCharge(orderId, { ageMinutes: 3 });
    harness.gateway.markPaid(newCharge.chargeId, START);
    harness.gateway.failNextCancel();
    await runReconcile({ orderId, chargeId: newCharge.chargeId });
    expect((await loadOrder(orderId)).status).toBe("paid");
    expect(reconciledEntryList()).toHaveLength(1);
    expect(
      harness.memoryLogger
        .readEntryList()
        .find((entry) => entry.errorCode === CANCEL_FAILED_ERROR_CODE),
    ).toMatchObject({ level: WARN_LEVEL, chargeId: oldCharge.chargeId });
    expect((await harness.gateway.getChargeStatus(oldCharge)).status).toBe("pending");

    harness.gateway.markPaid(oldCharge.chargeId, START);
    const [followUp] = (await listJobs("charge.reconcile")).filter(
      (row) => row.status === "pending",
    );
    const laterClock = new Date(followUp?.runAfterDatetime.getTime() ?? 0);
    const outcome = await workJob(testDatabase.db, {
      nameList: ["charge.reconcile"],
      workerId: WORKER_ID,
      clock: () => laterClock,
      handler: harness.definition.handle,
    });
    expect(outcome).toMatchObject({ outcome: "completed", jobId: followUp?.jobId });
    expect(await testDatabase.db.$count(supportTicket, eq(supportTicket.orderId, orderId))).toBe(1);
    expect((await loadCharge(oldCharge.chargeId)).status).toBe("paid");
  });

  it("valor divergente ou referência de outro pedido: payment_mismatch sem escrita, job failed, alerta", async () => {
    const orderId = await createOrder();
    const cheaper = await createCharge(orderId, { amountCents: 1000 });
    harness.gateway.markPaid(cheaper.chargeId, START);
    const amountEvent = await insertWebhookEvent();
    expect(
      await runReconcile({ orderId, chargeId: cheaper.chargeId, webhookEventId: amountEvent }),
    ).toMatchObject({
      outcome: "failed",
      errorCode: "payment_mismatch",
    });
    expect((await loadOrder(orderId)).status).toBe("awaiting_payment");
    expect((await loadCharge(cheaper.chargeId)).status).toBe("pending");
    expect((await loadWebhookEvent(amountEvent)).outcomeCode).toBe("payment_mismatch");

    const otherOrderId = await createOrder();
    const foreign = await createCharge(orderId, { gatewayOrderRef: otherOrderId });
    harness.gateway.markPaid(foreign.chargeId, START);
    expect(await runReconcile({ orderId, chargeId: foreign.chargeId })).toMatchObject({
      outcome: "failed",
      errorCode: "payment_mismatch",
    });
    expect(reconciledEntryList().map((entry) => [entry.level, entry.reason])).toEqual([
      [ERROR_LEVEL, "amount"],
      [ERROR_LEVEL, "external_reference"],
    ]);
    expect(await listJobs("order.generate")).toEqual([]);
  });

  it("gateway indisponível volta à fila sem processar o evento; esgotado, o onExhausted grava o código", async () => {
    const orderId = await createOrder();
    const pending = await createCharge(orderId);
    const webhookEventId = await insertWebhookEvent();
    harness.gateway.failNextStatus();
    expect(
      await runReconcile({ orderId, chargeId: pending.chargeId, webhookEventId }),
    ).toMatchObject({
      outcome: "retry_scheduled",
      errorCode: "gateway_unavailable",
    });
    expect((await loadWebhookEvent(webhookEventId)).processedDatetime).toBeNull();
    expect(reconciledEntryList().at(-1)).toMatchObject({ level: WARN_LEVEL });

    const exhaustedEvent = await insertWebhookEvent();
    harness.gateway.failNextStatus();
    expect(
      await runReconcile(
        { orderId, chargeId: pending.chargeId, webhookEventId: exhaustedEvent },
        { maxAttemptCount: 1 },
      ),
    ).toMatchObject({ outcome: "failed", errorCode: "gateway_unavailable" });
    expect(await loadWebhookEvent(exhaustedEvent)).toMatchObject({
      processedDatetime: START,
      outcomeCode: "gateway_unavailable",
    });
    expect(JOB_MAX_ATTEMPT_COUNT).toBeGreaterThan(1);
  });

  it("gateway recusando a consulta é falha definitiva com o evento processado", async () => {
    const orderId = await createOrder();
    const pending = await createCharge(orderId);
    const webhookEventId = await insertWebhookEvent();
    harness.gateway.failNextStatus("gateway_rejected");
    expect(
      await runReconcile({ orderId, chargeId: pending.chargeId, webhookEventId }),
    ).toMatchObject({
      outcome: "failed",
      errorCode: "gateway_rejected",
    });
    expect((await loadWebhookEvent(webhookEventId)).outcomeCode).toBe("gateway_rejected");
    expect((await loadCharge(pending.chargeId)).status).toBe("pending");
  });

  it("cobrança que não existe ou é de outro pedido: charge_not_found, evento processado, job concluído", async () => {
    const orderId = await createOrder();
    const otherOrderId = await createOrder();
    const foreign = await createCharge(otherOrderId);
    for (const chargeId of [crypto.randomUUID(), foreign.chargeId]) {
      const webhookEventId = await insertWebhookEvent();
      expect(await runReconcile({ orderId, chargeId, webhookEventId })).toMatchObject({
        outcome: "completed",
      });
      expect((await loadWebhookEvent(webhookEventId)).outcomeCode).toBe("charge_not_found");
    }
    expect((await loadCharge(foreign.chargeId)).status).toBe("pending");
  });

  it("sem id na consulta, o pagamento usa o gateway_payment_id gravado na criação", async () => {
    const orderId = await createOrder();
    const pending = await createCharge(orderId);
    harness.gateway.markPaid(pending.chargeId, START);
    const gatewayWithoutPaymentId = {
      ...harness.gateway,
      getChargeStatus: async (reference: Parameters<FakePaymentGateway["getChargeStatus"]>[0]) => ({
        ...(await harness.gateway.getChargeStatus(reference)),
        gatewayPaymentId: null,
      }),
    };
    const definition = createChargeReconcileJob({
      db: testDatabase.db,
      paymentGateway: gatewayWithoutPaymentId,
      logger: harness.memoryLogger.logger,
      now: () => START,
    });
    await enqueueJob(
      testDatabase.db,
      { name: "charge.reconcile", orderId, chargeId: pending.chargeId },
      { runAfterDatetime: START },
    );
    const outcome = await workJob(testDatabase.db, {
      nameList: ["charge.reconcile"],
      workerId: WORKER_ID,
      clock: () => START,
      handler: definition.handle,
    });
    expect(outcome).toMatchObject({ outcome: "completed" });
    expect(await loadCharge(pending.chargeId)).toMatchObject({
      status: "paid",
      gatewayPaymentId: pending.gatewayPaymentId,
    });
  });
});

describe("charge.reconcile periódico (spec F2-04, RF-10)", () => {
  it("varre as pendentes com mais de 1 minuto, segue depois de um erro do gateway e não duplica na rodada seguinte", async () => {
    const failingOrderId = await createOrder();
    const failing = await createCharge(failingOrderId, { ageMinutes: 50 });
    const paidOrderId = await createOrder();
    const paid = await createCharge(paidOrderId, { ageMinutes: 20 });
    harness.gateway.markPaid(paid.chargeId, START);
    const expiredOrderId = await createOrder();
    const expired = await createCharge(expiredOrderId, { ageMinutes: 10 });
    harness.gateway.markExpired(expired.chargeId);
    const pendingOrderId = await createOrder();
    const pending = await createCharge(pendingOrderId, { ageMinutes: 5 });
    const youngOrderId = await createOrder();
    const young = await createCharge(youngOrderId, { ageMinutes: 0.5 });
    harness.gateway.markPaid(young.chargeId, START);
    const paidAlreadyOrderId = await createOrder("paid");
    await createCharge(paidAlreadyOrderId, { ageMinutes: 30 });
    harness.gateway.failNextStatus();

    expect(await runReconcile({})).toMatchObject({ outcome: "completed", errorCode: null });

    expect((await loadCharge(failing.chargeId)).status).toBe("pending");
    expect((await loadOrder(paidOrderId)).status).toBe("paid");
    expect((await loadCharge(paid.chargeId)).status).toBe("paid");
    expect((await loadCharge(expired.chargeId)).status).toBe("expired");
    expect((await loadCharge(pending.chargeId)).status).toBe("pending");
    expect((await loadOrder(youngOrderId)).status).toBe("awaiting_payment");
    expect((await listJobs("order.generate")).map((row) => row.payload)).toEqual([
      { name: "order.generate", orderId: paidOrderId },
    ]);
    const scan = harness.memoryLogger
      .readEntryList()
      .find((entry) => entry.msg === CHARGE_RECONCILE_SCAN_LOG_MESSAGE);
    expect(scan).toMatchObject({
      scannedCount: 4,
      paidCount: 1,
      expiredCount: 1,
      pendingCount: 1,
      errorCount: 1,
      aborted: false,
    });
    expect(reconciledEntryList()[0]).toMatchObject({
      level: WARN_LEVEL,
      chargeId: failing.chargeId,
      errorCode: "gateway_unavailable",
    });

    expect(await runReconcile({})).toMatchObject({ outcome: "completed" });
    expect(await listJobs("order.generate")).toHaveLength(1);
    expect((await loadCharge(failing.chargeId)).status).toBe("pending");
    expect(await testDatabase.db.$count(supportTicket)).toBe(0);
  });

  it("varredura e job dirigido no mesmo pedido ao mesmo tempo dão um paid e um already_paid", async () => {
    const orderId = await createOrder();
    const pending = await createCharge(orderId, { ageMinutes: 5 });
    harness.gateway.markPaid(pending.chargeId, START);
    const webhookEventId = await insertWebhookEvent();
    await enqueueJob(
      testDatabase.db,
      { name: "charge.reconcile", orderId, chargeId: pending.chargeId, webhookEventId },
      { runAfterDatetime: START },
    );
    await enqueueJob(testDatabase.db, { name: "charge.reconcile" }, { runAfterDatetime: START });
    const outcomeList = await Promise.all(
      ["worker-a", "worker-b"].map((workerId) =>
        workJob(testDatabase.db, {
          nameList: ["charge.reconcile"],
          workerId,
          clock: () => START,
          handler: harness.definition.handle,
        }),
      ),
    );
    expect(outcomeList.map((outcome) => outcome.outcome)).toEqual(["completed", "completed"]);
    expect((await loadOrder(orderId)).status).toBe("paid");
    expect(await listJobs("order.generate")).toHaveLength(1);
    expect(
      reconciledEntryList()
        .map((entry) => entry.outcome)
        .sort(),
    ).toEqual(["already_paid", "paid"]);
    expect(["paid", "already_paid"]).toContain(
      (await loadWebhookEvent(webhookEventId)).outcomeCode ?? "",
    );
  });

  it("os logs nunca levam o qr code, o e-mail ou o payload", async () => {
    const orderId = await createOrder();
    const pending = await createCharge(orderId);
    harness.gateway.markPaid(pending.chargeId, START);
    await runReconcile({ orderId, chargeId: pending.chargeId });
    await runReconcile({});
    const logText = JSON.stringify(harness.memoryLogger.readEntryList());
    expect(logText).not.toContain(pending.qrCode);
    expect(logText).not.toContain(PAYER_EMAIL);
    expect(logText).not.toContain('"name":"charge.reconcile"');
    expect(logText).toContain(orderId);
  });
});

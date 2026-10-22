import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { CHARGE_RECONCILE_MIN_AGE_MINUTES, type OrderStatus } from "@gizito/core";
import { eq } from "drizzle-orm";
import { buildChargeInsert, buildOrderInsert } from "#src/__tests__/integration/helpers.ts";
import {
  expireCharge,
  findChargeByGatewayOrderId,
  findChargeForReconcile,
  listChargesToReconcile,
  listPendingOrderCharges,
} from "#src/charge/reconcile.ts";
import { charge, order } from "#src/schema/index.ts";
import {
  createTestDatabase,
  type TestDatabase,
  truncateAllTables,
} from "#src/test-helpers/index.ts";

const NOW = new Date("2026-10-22T12:10:00.000Z");
const MILLISECONDS_PER_MINUTE = 60_000;

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

async function insertOrder(status: OrderStatus = "awaiting_payment") {
  const [row] = await testDatabase.db
    .insert(order)
    .values(buildOrderInsert({ status }))
    .returning({ orderId: order.orderId });
  if (!row) throw new Error("insert returned no row");
  return row.orderId;
}

async function insertCharge(
  orderId: string,
  ageMinutes: number,
  overrides: Partial<typeof charge.$inferInsert> = {},
) {
  const insertDatetime = new Date(NOW.getTime() - ageMinutes * MILLISECONDS_PER_MINUTE);
  const [row] = await testDatabase.db
    .insert(charge)
    .values(buildChargeInsert(orderId, { insertDatetime, ...overrides }))
    .returning();
  if (!row) throw new Error("insert returned no row");
  return row;
}

describe("leituras da reconciliação (spec F2-04, RF-06)", () => {
  it("listChargesToReconcile pega só pendentes com mais de 1 minuto de pedidos aguardando pagamento, na ordem, até o limite", async () => {
    const orderId = await insertOrder();
    const oldest = await insertCharge(orderId, 40, { gatewayOrderId: "ord-oldest" });
    const old = await insertCharge(orderId, 5, { gatewayOrderId: "ord-old" });
    await insertCharge(orderId, 0.5, { gatewayOrderId: "ord-young" });
    await insertCharge(orderId, 10, { status: "expired", gatewayOrderId: "ord-expired" });
    const paidOrderId = await insertOrder("paid");
    await insertCharge(paidOrderId, 10, { gatewayOrderId: "ord-of-paid-order" });
    const previewOrderId = await insertOrder("preview_ready");
    await insertCharge(previewOrderId, 10, { gatewayOrderId: "ord-of-preview" });

    const all = await listChargesToReconcile(testDatabase.db, {
      now: NOW,
      minAgeMinutes: CHARGE_RECONCILE_MIN_AGE_MINUTES,
      limit: 10,
    });
    expect(all.map((row) => row.chargeId)).toEqual([oldest.chargeId, old.chargeId]);
    expect(all[0]).toEqual({
      chargeId: oldest.chargeId,
      orderId,
      gatewayOrderId: "ord-oldest",
      gatewayPaymentId: null,
      amountCents: oldest.amountCents,
      status: "pending",
      expireDatetime: oldest.expireDatetime,
    });
    const limited = await listChargesToReconcile(testDatabase.db, {
      now: NOW,
      minAgeMinutes: CHARGE_RECONCILE_MIN_AGE_MINUTES,
      limit: 1,
    });
    expect(limited.map((row) => row.chargeId)).toEqual([oldest.chargeId]);
  });

  it("findChargeForReconcile e findChargeByGatewayOrderId acham a cobrança em qualquer status", async () => {
    const orderId = await insertOrder();
    const expired = await insertCharge(orderId, 50, {
      status: "expired",
      gateway: "fake",
      gatewayOrderId: "fake-order-x",
    });
    expect(await findChargeForReconcile(testDatabase.db, expired.chargeId)).toMatchObject({
      chargeId: expired.chargeId,
      status: "expired",
    });
    expect(
      await findChargeByGatewayOrderId(testDatabase.db, {
        gateway: "fake",
        gatewayOrderId: "fake-order-x",
      }),
    ).toMatchObject({ chargeId: expired.chargeId, orderId });
    expect(
      await findChargeByGatewayOrderId(testDatabase.db, {
        gateway: "mercadopago",
        gatewayOrderId: "fake-order-x",
      }),
    ).toBeNull();
    expect(await findChargeForReconcile(testDatabase.db, crypto.randomUUID())).toBeNull();
  });

  it("listPendingOrderCharges devolve só as pendentes do pedido, na ordem", async () => {
    const orderId = await insertOrder();
    const first = await insertCharge(orderId, 30);
    await insertCharge(orderId, 20, { status: "expired" });
    const second = await insertCharge(orderId, 1);
    const otherOrderId = await insertOrder();
    await insertCharge(otherOrderId, 1);
    expect(
      (await listPendingOrderCharges(testDatabase.db, orderId)).map((row) => row.chargeId),
    ).toEqual([first.chargeId, second.chargeId]);
  });

  it("expireCharge muda a pendente uma vez e nunca toca paga", async () => {
    const orderId = await insertOrder();
    const pending = await insertCharge(orderId, 40);
    expect(await expireCharge(testDatabase.db, pending.chargeId)).toBe(true);
    expect(await expireCharge(testDatabase.db, pending.chargeId)).toBe(false);
    const paid = await insertCharge(orderId, 40, {
      status: "paid",
      gatewayPaymentId: "pay-1",
      paidDatetime: NOW,
    });
    expect(await expireCharge(testDatabase.db, paid.chargeId)).toBe(false);
    const [paidRow] = await testDatabase.db
      .select()
      .from(charge)
      .where(eq(charge.chargeId, paid.chargeId));
    expect(paidRow?.status).toBe("paid");
  });
});

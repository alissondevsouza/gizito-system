import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { chargeSchema } from "@gizito/core";
import {
  buildChargeInsert,
  buildOrderInsert,
  expectSqlState,
  SQL_STATE,
} from "#src/__tests__/integration/helpers.ts";
import { charge, order } from "#src/schema/index.ts";
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

describe("charge", () => {
  it("insere cobrança pendente e a linha passa no chargeSchema do core", async () => {
    const orderId = await insertOrderId();
    const [row] = await testDatabase.db
      .insert(charge)
      .values(buildChargeInsert(orderId))
      .returning();
    expect(row?.status).toBe("pending");
    expect(row?.gatewayPaymentId).toBeNull();
    expect(row?.refundDatetime).toBeNull();
    expect(chargeSchema.safeParse(row).success).toBe(true);
  });

  it("aceita cobrança sem qr_code_base64, que o sandbox devolve vazio", async () => {
    const orderId = await insertOrderId();
    const [row] = await testDatabase.db
      .insert(charge)
      .values(buildChargeInsert(orderId, { qrCodeBase64: null }))
      .returning();
    expect(row?.qrCodeBase64).toBeNull();
    expect(chargeSchema.safeParse(row).success).toBe(true);
  });

  it("aceita várias cobranças sem gateway_payment_id no mesmo pedido", async () => {
    const orderId = await insertOrderId();
    await testDatabase.db
      .insert(charge)
      .values([buildChargeInsert(orderId), buildChargeInsert(orderId), buildChargeInsert(orderId)]);
    const chargeList = await testDatabase.db.query.charge.findMany({
      where: (table, { eq }) => eq(table.orderId, orderId),
    });
    expect(chargeList).toHaveLength(3);
  });

  it("rejeita gateway_payment_id repetido, mesmo entre pedidos diferentes", async () => {
    const firstOrderId = await insertOrderId();
    const secondOrderId = await insertOrderId();
    await testDatabase.db
      .insert(charge)
      .values(buildChargeInsert(firstOrderId, { gatewayPaymentId: "pay-123", status: "paid" }));
    await expectSqlState(
      testDatabase.db
        .insert(charge)
        .values(buildChargeInsert(secondOrderId, { gatewayPaymentId: "pay-123" })),
      SQL_STATE.uniqueViolation,
    );
  });

  it("rejeita gateway_order_id repetido no mesmo gateway; outro gateway aceita", async () => {
    const orderId = await insertOrderId();
    await testDatabase.db
      .insert(charge)
      .values(buildChargeInsert(orderId, { gatewayOrderId: "ord-1" }));
    await expectSqlState(
      testDatabase.db
        .insert(charge)
        .values(buildChargeInsert(orderId, { gatewayOrderId: "ord-1" })),
      SQL_STATE.uniqueViolation,
    );
    await testDatabase.db
      .insert(charge)
      .values(buildChargeInsert(orderId, { gateway: "asaas", gatewayOrderId: "ord-1" }));
  });

  it("rejeita amount_cents zero ou negativo", async () => {
    const orderId = await insertOrderId();
    await expectSqlState(
      testDatabase.db.insert(charge).values(buildChargeInsert(orderId, { amountCents: 0 })),
      SQL_STATE.checkViolation,
    );
    await expectSqlState(
      testDatabase.db.insert(charge).values(buildChargeInsert(orderId, { amountCents: -1 })),
      SQL_STATE.checkViolation,
    );
  });

  it("rejeita cobrança de pedido inexistente", async () => {
    await expectSqlState(
      testDatabase.db.insert(charge).values(buildChargeInsert(crypto.randomUUID())),
      SQL_STATE.foreignKeyViolation,
    );
  });
});

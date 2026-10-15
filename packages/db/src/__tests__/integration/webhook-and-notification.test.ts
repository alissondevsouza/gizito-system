import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { and, eq } from "drizzle-orm";
import { buildOrderInsert, expectSqlState, SQL_STATE } from "#src/__tests__/integration/helpers.ts";
import { notification, order, supportTicket, webhookEvent } from "#src/schema/index.ts";
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

describe("webhook_event", () => {
  it("é único por (source, external_id) e aceita o mesmo external_id em outra fonte", async () => {
    await testDatabase.db
      .insert(webhookEvent)
      .values({ source: "mercadopago", externalId: "evt-1" });
    await expectSqlState(
      testDatabase.db.insert(webhookEvent).values({ source: "mercadopago", externalId: "evt-1" }),
      SQL_STATE.uniqueViolation,
    );
    await testDatabase.db.insert(webhookEvent).values({ source: "whatsapp", externalId: "evt-1" });
    const [row] = await testDatabase.db
      .select()
      .from(webhookEvent)
      .where(and(eq(webhookEvent.source, "whatsapp"), eq(webhookEvent.externalId, "evt-1")));
    expect(row?.receivedDatetime).toBeInstanceOf(Date);
    expect(row?.processedDatetime).toBeNull();
  });
});

describe("notification", () => {
  it("um envio por (order_id, kind, channel); retry atualiza a linha em vez de inserir outra", async () => {
    const orderId = await insertOrderId();
    const [first] = await testDatabase.db
      .insert(notification)
      .values({
        orderId,
        channel: "email",
        kind: "kit_ready",
        status: "failed",
        errorCode: "timeout",
      })
      .returning();
    await expectSqlState(
      testDatabase.db.insert(notification).values({ orderId, channel: "email", kind: "kit_ready" }),
      SQL_STATE.uniqueViolation,
    );
    await testDatabase.db
      .insert(notification)
      .values({ orderId, channel: "whatsapp", kind: "kit_ready" });
    const [retried] = await testDatabase.db
      .update(notification)
      .set({ status: "sent", errorCode: null, providerMessageId: "msg-1" })
      .where(eq(notification.notificationId, first?.notificationId ?? ""))
      .returning();
    expect(retried?.status).toBe("sent");
    const loaded = await testDatabase.db.query.order.findFirst({
      where: eq(order.orderId, orderId),
      with: { notificationList: true },
    });
    expect(loaded?.notificationList).toHaveLength(2);
  });
});

describe("support_ticket", () => {
  it("abre com status open e aparece em supportTicketList", async () => {
    const orderId = await insertOrderId();
    const [row] = await testDatabase.db
      .insert(supportTicket)
      .values({ orderId, kind: "duplicate_payment" })
      .returning();
    expect(row?.status).toBe("open");
    expect(row?.noteText).toBeNull();
    const loaded = await testDatabase.db.query.order.findFirst({
      where: eq(order.orderId, orderId),
      with: { supportTicketList: true },
    });
    expect(loaded?.supportTicketList.map((ticket) => ticket.kind)).toEqual(["duplicate_payment"]);
  });
});

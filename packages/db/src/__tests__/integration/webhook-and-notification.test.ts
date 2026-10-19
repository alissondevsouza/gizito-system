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

const RECIPIENT_HASH = "a".repeat(64);
const OTHER_RECIPIENT_HASH = "b".repeat(64);

describe("notification", () => {
  it("um envio por (order_id, kind, channel, destinatário); retry atualiza a linha", async () => {
    const orderId = await insertOrderId();
    const [first] = await testDatabase.db
      .insert(notification)
      .values({
        orderId,
        channel: "email",
        kind: "kit_ready",
        recipientHash: RECIPIENT_HASH,
        status: "failed",
        errorCode: "timeout",
      })
      .returning();
    await expectSqlState(
      testDatabase.db
        .insert(notification)
        .values({ orderId, channel: "email", kind: "kit_ready", recipientHash: RECIPIENT_HASH }),
      SQL_STATE.uniqueViolation,
    );
    await testDatabase.db
      .insert(notification)
      .values({ orderId, channel: "whatsapp", kind: "kit_ready", recipientHash: RECIPIENT_HASH });
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

  it("reenvio para outro destinatário (e-mail corrigido) é outra linha", async () => {
    const orderId = await insertOrderId();
    await testDatabase.db
      .insert(notification)
      .values({ orderId, channel: "email", kind: "order_link", recipientHash: RECIPIENT_HASH });
    await testDatabase.db.insert(notification).values({
      orderId,
      channel: "email",
      kind: "order_link",
      recipientHash: OTHER_RECIPIENT_HASH,
    });
  });

  it("só a ajuda do WhatsApp vive sem pedido, e ela nunca tem pedido", async () => {
    await testDatabase.db
      .insert(notification)
      .values({ channel: "whatsapp", kind: "whatsapp_help", recipientHash: RECIPIENT_HASH });
    await testDatabase.db
      .insert(notification)
      .values({ channel: "whatsapp", kind: "whatsapp_help", recipientHash: RECIPIENT_HASH });
    await expectSqlState(
      testDatabase.db
        .insert(notification)
        .values({ channel: "email", kind: "order_link", recipientHash: RECIPIENT_HASH }),
      SQL_STATE.checkViolation,
    );
    const orderId = await insertOrderId();
    await expectSqlState(
      testDatabase.db.insert(notification).values({
        orderId,
        channel: "whatsapp",
        kind: "whatsapp_help",
        recipientHash: RECIPIENT_HASH,
      }),
      SQL_STATE.checkViolation,
    );
  });

  it("recipient_hash é sempre um hash, nunca o destinatário", async () => {
    const orderId = await insertOrderId();
    await expectSqlState(
      testDatabase.db.insert(notification).values({
        orderId,
        channel: "email",
        kind: "kit_ready",
        recipientHash: "mae@example.com",
      }),
      SQL_STATE.checkViolation,
    );
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

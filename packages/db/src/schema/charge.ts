import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { chargeStatusEnum, paymentGatewayEnum } from "#src/schema/enums.ts";
import { order } from "#src/schema/order.ts";
import { datetime, timestampColumnMap } from "#src/schema/timestamps.ts";

export const charge = pgTable(
  "charge",
  {
    chargeId: uuid("charge_id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => order.orderId, { onDelete: "restrict" }),
    gateway: paymentGatewayEnum("gateway").notNull(),
    gatewayOrderId: text("gateway_order_id"),
    gatewayPaymentId: text("gateway_payment_id"),
    amountCents: integer("amount_cents").notNull(),
    status: chargeStatusEnum("status").notNull().default("pending"),
    qrCode: text("qr_code").notNull(),
    qrCodeBase64: text("qr_code_base64").notNull(),
    ticketUrl: text("ticket_url"),
    expireDatetime: datetime("expire_datetime").notNull(),
    paidDatetime: datetime("paid_datetime"),
    refundId: text("refund_id"),
    refundDatetime: datetime("refund_datetime"),
    ...timestampColumnMap,
  },
  (table) => [
    index("charge_order_id_idx").on(table.orderId),
    uniqueIndex("charge_gateway_payment_id_idx")
      .on(table.gatewayPaymentId)
      .where(sql`${table.gatewayPaymentId} IS NOT NULL`),
    index("charge_status_expire_datetime_idx").on(table.status, table.expireDatetime),
    check("charge_amount_cents_check", sql`${table.amountCents} > 0`),
  ],
);

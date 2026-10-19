import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import {
  notificationChannelEnum,
  notificationKindEnum,
  notificationStatusEnum,
} from "#src/schema/enums.ts";
import { order } from "#src/schema/order.ts";
import { timestampColumnMap } from "#src/schema/timestamps.ts";

export const notification = pgTable(
  "notification",
  {
    notificationId: uuid("notification_id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").references(() => order.orderId, { onDelete: "restrict" }),
    channel: notificationChannelEnum("channel").notNull(),
    kind: notificationKindEnum("kind").notNull(),
    recipientHash: text("recipient_hash").notNull(),
    status: notificationStatusEnum("status").notNull().default("pending"),
    providerMessageId: text("provider_message_id"),
    errorCode: text("error_code"),
    ...timestampColumnMap,
  },
  (table) => [
    uniqueIndex("notification_order_id_kind_channel_recipient_hash_idx").on(
      table.orderId,
      table.kind,
      table.channel,
      table.recipientHash,
    ),
    index("notification_recipient_hash_kind_insert_datetime_idx").on(
      table.recipientHash,
      table.kind,
      table.insertDatetime,
    ),
    check(
      "notification_order_id_check",
      sql`(${table.orderId} IS NULL) = (${table.kind} = 'whatsapp_help')`,
    ),
    check("notification_recipient_hash_check", sql`${table.recipientHash} ~ '^[a-f0-9]{64}$'`),
  ],
);

import { pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
    orderId: uuid("order_id")
      .notNull()
      .references(() => order.orderId, { onDelete: "restrict" }),
    channel: notificationChannelEnum("channel").notNull(),
    kind: notificationKindEnum("kind").notNull(),
    status: notificationStatusEnum("status").notNull().default("pending"),
    providerMessageId: text("provider_message_id"),
    errorCode: text("error_code"),
    ...timestampColumnMap,
  },
  (table) => [
    uniqueIndex("notification_order_id_kind_channel_idx").on(
      table.orderId,
      table.kind,
      table.channel,
    ),
  ],
);

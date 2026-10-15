import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { supportTicketKindEnum, supportTicketStatusEnum } from "#src/schema/enums.ts";
import { order } from "#src/schema/order.ts";
import { timestampColumnMap } from "#src/schema/timestamps.ts";

export const supportTicket = pgTable(
  "support_ticket",
  {
    supportTicketId: uuid("support_ticket_id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => order.orderId, { onDelete: "restrict" }),
    kind: supportTicketKindEnum("kind").notNull(),
    status: supportTicketStatusEnum("status").notNull().default("open"),
    noteText: text("note_text"),
    ...timestampColumnMap,
  },
  (table) => [
    index("support_ticket_order_id_idx").on(table.orderId),
    index("support_ticket_status_idx").on(table.status),
  ],
);

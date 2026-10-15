import { pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { webhookSourceEnum } from "#src/schema/enums.ts";
import { datetime, timestampColumnMap } from "#src/schema/timestamps.ts";

export const webhookEvent = pgTable(
  "webhook_event",
  {
    webhookEventId: uuid("webhook_event_id").primaryKey().defaultRandom(),
    source: webhookSourceEnum("source").notNull(),
    externalId: text("external_id").notNull(),
    receivedDatetime: datetime("received_datetime").notNull().defaultNow(),
    processedDatetime: datetime("processed_datetime"),
    outcomeCode: text("outcome_code"),
    ...timestampColumnMap,
  },
  (table) => [
    uniqueIndex("webhook_event_source_external_id_idx").on(table.source, table.externalId),
  ],
);

import { sql } from "drizzle-orm";
import { check, index, integer, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { aiStageEnum } from "#src/schema/enums.ts";
import { order } from "#src/schema/order.ts";
import { timestampColumnMap } from "#src/schema/timestamps.ts";

export const aiCall = pgTable(
  "ai_call",
  {
    aiCallId: uuid("ai_call_id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => order.orderId, { onDelete: "restrict" }),
    stage: aiStageEnum("stage").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    inputTokenCount: integer("input_token_count").notNull(),
    outputTokenCount: integer("output_token_count").notNull(),
    costCents: numeric("cost_cents", { precision: 12, scale: 6, mode: "number" }).notNull(),
    durationMs: integer("duration_ms").notNull(),
    outcomeCode: text("outcome_code").notNull(),
    ...timestampColumnMap,
  },
  (table) => [
    index("ai_call_order_id_idx").on(table.orderId),
    check(
      "ai_call_non_negative_check",
      sql`${table.inputTokenCount} >= 0 AND ${table.outputTokenCount} >= 0 AND ${table.costCents} >= 0 AND ${table.durationMs} >= 0`,
    ),
  ],
);

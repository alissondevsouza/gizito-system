import { sql } from "drizzle-orm";
import { type AnyPgColumn, check, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { jsonb } from "#src/schema/jsonb.ts";
import { order } from "#src/schema/order.ts";
import { datetime, timestampColumnMap } from "#src/schema/timestamps.ts";

export const kit = pgTable(
  "kit",
  {
    kitId: uuid("kit_id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => order.orderId, { onDelete: "restrict" }),
    studyKit: jsonb("study_kit"),
    generationVersion: text("generation_version").notNull(),
    taxonomyVersion: text("taxonomy_version").notNull(),
    activitiesStorageKey: text("activities_storage_key").notNull(),
    answerKeyStorageKey: text("answer_key_storage_key").notNull(),
    pageCountActivities: integer("page_count_activities").notNull(),
    pageCountAnswerKey: integer("page_count_answer_key").notNull(),
    publishedDatetime: datetime("published_datetime").notNull(),
    supersededByKitId: uuid("superseded_by_kit_id").references((): AnyPgColumn => kit.kitId, {
      onDelete: "set null",
    }),
    deleteDatetime: datetime("delete_datetime"),
    ...timestampColumnMap,
  },
  (table) => [
    index("kit_order_id_idx").on(table.orderId),
    index("kit_delete_datetime_published_datetime_idx").on(
      table.deleteDatetime,
      table.publishedDatetime,
    ),
    check(
      "kit_page_count_check",
      sql`${table.pageCountActivities} > 0 AND ${table.pageCountAnswerKey} > 0`,
    ),
  ],
);

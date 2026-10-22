import { MAX_PHOTO_COUNT } from "@gizito/core";
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, real, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { order } from "#src/schema/order.ts";
import { datetime, timestampColumnMap } from "#src/schema/timestamps.ts";

export const orderPhoto = pgTable(
  "order_photo",
  {
    orderPhotoId: uuid("order_photo_id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => order.orderId, { onDelete: "restrict" }),
    photoIndex: integer("photo_index").notNull(),
    storageKey: text("storage_key").notNull(),
    contentHash: text("content_hash").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    legibilityScore: real("legibility_score"),
    replacedDatetime: datetime("replaced_datetime"),
    deleteDatetime: datetime("delete_datetime"),
    ...timestampColumnMap,
  },
  (table) => [
    index("order_photo_order_id_idx").on(table.orderId),
    uniqueIndex("order_photo_order_id_photo_index_idx")
      .on(table.orderId, table.photoIndex)
      .where(sql`${table.replacedDatetime} IS NULL`),
    index("order_photo_content_hash_idx").on(table.contentHash),
    index("order_photo_delete_datetime_insert_datetime_idx").on(
      table.deleteDatetime,
      table.insertDatetime,
    ),
    check("order_photo_dimensions_check", sql`${table.width} > 0 AND ${table.height} > 0`),
    check(
      "order_photo_photo_index_check",
      sql`${table.photoIndex} >= 0 AND ${table.photoIndex} < ${sql.raw(String(MAX_PHOTO_COUNT))}`,
    ),
    check(
      "order_photo_legibility_score_check",
      sql`${table.legibilityScore} IS NULL OR (${table.legibilityScore} >= 0 AND ${table.legibilityScore} <= 1)`,
    ),
  ],
);

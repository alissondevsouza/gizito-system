import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { timestampColumnMap } from "#src/schema/timestamps.ts";

export const previewRequest = pgTable(
  "preview_request",
  {
    previewRequestId: uuid("preview_request_id").primaryKey().defaultRandom(),
    clientIpHash: text("client_ip_hash").notNull(),
    deviceHash: text("device_hash").notNull(),
    ...timestampColumnMap,
  },
  (table) => [
    index("preview_request_client_ip_hash_insert_datetime_idx").on(
      table.clientIpHash,
      table.insertDatetime,
    ),
    index("preview_request_device_hash_insert_datetime_idx").on(
      table.deviceHash,
      table.insertDatetime,
    ),
    index("preview_request_insert_datetime_idx").on(table.insertDatetime),
    check("preview_request_client_ip_hash_check", sql`${table.clientIpHash} ~ '^[a-f0-9]{64}$'`),
    check("preview_request_device_hash_check", sql`${table.deviceHash} ~ '^[a-f0-9]{64}$'`),
  ],
);

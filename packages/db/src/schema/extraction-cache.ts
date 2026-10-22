import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { jsonb } from "#src/schema/jsonb.ts";
import { datetime, timestampColumnMap } from "#src/schema/timestamps.ts";

export const extractionCache = pgTable(
  "extraction_cache",
  {
    extractionCacheId: uuid("extraction_cache_id").primaryKey().defaultRandom(),
    cacheKey: text("cache_key").notNull(),
    extraction: jsonb("extraction").notNull(),
    issueList: jsonb("issue_list").notNull(),
    expireDatetime: datetime("expire_datetime").notNull(),
    ...timestampColumnMap,
  },
  (table) => [
    uniqueIndex("extraction_cache_cache_key_idx").on(table.cacheKey),
    index("extraction_cache_expire_datetime_idx").on(table.expireDatetime),
  ],
);

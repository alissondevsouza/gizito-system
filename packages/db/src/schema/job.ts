import { JOB_MAX_ATTEMPT_COUNT } from "@gizito/core";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { jobNameEnum, jobStatusEnum } from "#src/schema/enums.ts";
import { jsonb } from "#src/schema/jsonb.ts";
import { datetime, timestampColumnMap } from "#src/schema/timestamps.ts";

export function activeSingletonPredicate(columnMap: {
  singletonKey: AnyPgColumn;
  status: AnyPgColumn;
}) {
  return sql`${columnMap.singletonKey} IS NOT NULL AND ${columnMap.status} IN ('pending', 'active')`;
}

export const job = pgTable(
  "job",
  {
    jobId: uuid("job_id").primaryKey().defaultRandom(),
    name: jobNameEnum("name").notNull(),
    payload: jsonb("payload").notNull(),
    status: jobStatusEnum("status").notNull().default("pending"),
    singletonKey: text("singleton_key"),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttemptCount: integer("max_attempt_count").notNull().default(JOB_MAX_ATTEMPT_COUNT),
    runAfterDatetime: datetime("run_after_datetime").notNull().defaultNow(),
    lockedBy: text("locked_by"),
    lockExpireDatetime: datetime("lock_expire_datetime"),
    finishDatetime: datetime("finish_datetime"),
    lastErrorCode: text("last_error_code"),
    ...timestampColumnMap,
  },
  (table) => [
    index("job_pending_name_run_after_datetime_idx")
      .on(table.name, table.runAfterDatetime, table.insertDatetime)
      .where(sql`${table.status} = 'pending'`),
    index("job_active_lock_expire_datetime_idx")
      .on(table.lockExpireDatetime)
      .where(sql`${table.status} = 'active'`),
    index("job_failed_finish_datetime_idx")
      .on(table.finishDatetime)
      .where(sql`${table.status} = 'failed'`),
    uniqueIndex("job_name_singleton_key_idx")
      .on(table.name, table.singletonKey)
      .where(activeSingletonPredicate(table)),
    check("job_attempt_count_check", sql`${table.attemptCount} >= 0`),
    check("job_max_attempt_count_check", sql`${table.maxAttemptCount} >= 1`),
    check(
      "job_payload_name_check",
      sql`${table.payload}->>'name' IS NOT DISTINCT FROM ${table.name}::text`,
    ),
  ],
);

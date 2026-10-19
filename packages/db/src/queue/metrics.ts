import type { QueueMetrics } from "@gizito/core";
import { jobErrorCodeMap } from "@gizito/core";
import { and, count, eq, gte, lte, min, sql } from "drizzle-orm";
import type { Executor } from "#src/client.ts";
import { DATABASE_HEALTH_TIMEOUT_MS, withDatabaseTimeout } from "#src/health.ts";
import { job } from "#src/schema/job.ts";

const MILLISECONDS_PER_SECOND = 1000;

export type GetQueueMetricsOptions = {
  now: Date;
  failedSinceDatetime: Date;
  timeoutMs?: number;
};

export async function getQueueMetrics(
  executor: Executor,
  { now, failedSinceDatetime, timeoutMs = DATABASE_HEALTH_TIMEOUT_MS }: GetQueueMetricsOptions,
): Promise<QueueMetrics> {
  const metricsQuery = Promise.all([
    executor
      .select({ readyCount: count(), oldestRunAfterDatetime: min(job.runAfterDatetime) })
      .from(job)
      .where(and(eq(job.status, "pending"), lte(job.runAfterDatetime, now))),
    executor.select({ activeCount: count() }).from(job).where(eq(job.status, "active")),
    executor
      .select({
        failedCount: count(),
        payloadInvalidCount:
          sql`count(*) FILTER (WHERE ${eq(job.lastErrorCode, jobErrorCodeMap.payloadInvalid)})`.mapWith(
            Number,
          ),
      })
      .from(job)
      .where(and(eq(job.status, "failed"), gte(job.finishDatetime, failedSinceDatetime))),
  ]);
  const [readyRowList, activeRowList, failedRowList] = await withDatabaseTimeout(
    metricsQuery,
    timeoutMs,
  );
  const [readyRow] = readyRowList;
  const [activeRow] = activeRowList;
  const [failedRow] = failedRowList;
  if (!readyRow || !activeRow || !failedRow) throw new Error("queue metrics query returned no row");
  const { oldestRunAfterDatetime } = readyRow;
  return {
    readyCount: readyRow.readyCount,
    oldestReadyAgeSeconds:
      oldestRunAfterDatetime === null
        ? null
        : Math.floor((now.getTime() - oldestRunAfterDatetime.getTime()) / MILLISECONDS_PER_SECOND),
    activeCount: activeRow.activeCount,
    failedCount: failedRow.failedCount,
    payloadInvalidCount: failedRow.payloadInvalidCount,
  };
}

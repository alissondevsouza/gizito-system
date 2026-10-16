import type { QueueMetrics } from "@gizito/core";
import { jobErrorCodeMap } from "@gizito/core";
import { and, eq, gte, inArray, lte, or, type SQL, sql } from "drizzle-orm";
import type { Executor } from "#src/client.ts";
import { job } from "#src/schema/job.ts";

export type GetQueueMetricsOptions = {
  now: Date;
  failedSinceDatetime: Date;
};

function countWhere(condition: SQL | undefined) {
  return sql`count(*) FILTER (WHERE ${condition})`.mapWith(Number);
}

export async function getQueueMetrics(
  executor: Executor,
  { now, failedSinceDatetime }: GetQueueMetricsOptions,
): Promise<QueueMetrics> {
  const readyCondition = and(eq(job.status, "pending"), lte(job.runAfterDatetime, now));
  const failedCondition = and(
    eq(job.status, "failed"),
    gte(job.finishDatetime, failedSinceDatetime),
  );
  const [row] = await executor
    .select({
      readyCount: countWhere(readyCondition),
      oldestReadyAgeSeconds: sql<
        number | null
      >`floor(extract(epoch FROM (${now.toISOString()}::timestamptz - min(${job.runAfterDatetime}) FILTER (WHERE ${readyCondition}))))`.mapWith(
        Number,
      ),
      activeCount: countWhere(eq(job.status, "active")),
      failedCount: countWhere(failedCondition),
      payloadInvalidCount: countWhere(
        and(failedCondition, eq(job.lastErrorCode, jobErrorCodeMap.payloadInvalid)),
      ),
    })
    .from(job)
    .where(or(inArray(job.status, ["pending", "active"]), failedCondition));
  if (!row) throw new Error("queue metrics query returned no row");
  return row;
}

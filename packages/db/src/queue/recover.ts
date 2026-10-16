import { and, eq, gte, lt, lte } from "drizzle-orm";
import type { Executor } from "#src/client.ts";
import { jobErrorCodeMap } from "#src/queue/error-codes.ts";
import { finishedPayloadSql } from "#src/queue/lease.ts";
import { job } from "#src/schema/job.ts";

export type RecoverExpiredJobsOptions = {
  now?: Date;
};

export type RecoverExpiredJobsResult = {
  requeuedCount: number;
  failedCount: number;
};

export async function recoverExpiredJobs(
  executor: Executor,
  { now = new Date() }: RecoverExpiredJobsOptions = {},
): Promise<RecoverExpiredJobsResult> {
  const expiredCondition = and(eq(job.status, "active"), lte(job.lockExpireDatetime, now));
  const released = {
    lockedBy: null,
    lockExpireDatetime: null,
    lastErrorCode: jobErrorCodeMap.lockExpired,
  };
  const failedRowList = await executor
    .update(job)
    .set({ ...released, status: "failed", finishDatetime: now, payload: finishedPayloadSql() })
    .where(and(expiredCondition, gte(job.attemptCount, job.maxAttemptCount)))
    .returning({ jobId: job.jobId });
  const requeuedRowList = await executor
    .update(job)
    .set({ ...released, status: "pending", runAfterDatetime: now })
    .where(and(expiredCondition, lt(job.attemptCount, job.maxAttemptCount)))
    .returning({ jobId: job.jobId });
  return { requeuedCount: requeuedRowList.length, failedCount: failedRowList.length };
}

import {
  jobErrorCodeMap,
  nextJobRunAfterDatetime,
  type OutcomeCode,
  outcomeCodeSchema,
} from "@gizito/core";
import { sql } from "drizzle-orm";
import type { Executor } from "#src/client.ts";
import { activeLeaseCondition, finishedPayloadSql, type JobLease } from "#src/queue/lease.ts";
import { job } from "#src/schema/job.ts";

export type FinishJobOptions = {
  now?: Date;
};

export type JobFailure = {
  errorCode: OutcomeCode;
  retryable: boolean;
};

export type FailJobOutcome = "retry_scheduled" | "failed" | "lease_lost";

export async function completeJob(
  executor: Executor,
  lease: JobLease,
  { now = new Date() }: FinishJobOptions = {},
): Promise<boolean> {
  const rowList = await executor
    .update(job)
    .set({
      status: "completed",
      finishDatetime: now,
      lockedBy: null,
      lockExpireDatetime: null,
      payload: finishedPayloadSql(),
    })
    .where(activeLeaseCondition(lease))
    .returning({ jobId: job.jobId });
  return rowList.length > 0;
}

export async function failJob(
  executor: Executor,
  lease: JobLease,
  failure: JobFailure,
  { now = new Date() }: FinishJobOptions = {},
): Promise<FailJobOutcome> {
  const lastErrorCode = outcomeCodeSchema.parse(failure.errorCode);
  const retryRunAfterDatetime = failure.retryable
    ? nextJobRunAfterDatetime(lease.attemptCount, now, lease.maxAttemptCount)
    : null;
  const released = { lockedBy: null, lockExpireDatetime: null, lastErrorCode };
  const rowList = await executor
    .update(job)
    .set(
      retryRunAfterDatetime
        ? { ...released, status: "pending", runAfterDatetime: retryRunAfterDatetime }
        : { ...released, status: "failed", finishDatetime: now, payload: finishedPayloadSql() },
    )
    .where(activeLeaseCondition(lease))
    .returning({ jobId: job.jobId });
  if (rowList.length === 0) return "lease_lost";
  return retryRunAfterDatetime ? "retry_scheduled" : "failed";
}

export async function releaseJob(
  executor: Executor,
  lease: JobLease,
  { now = new Date() }: FinishJobOptions = {},
): Promise<boolean> {
  const rowList = await executor
    .update(job)
    .set({
      status: "pending",
      runAfterDatetime: now,
      lockedBy: null,
      lockExpireDatetime: null,
      attemptCount: sql`${job.attemptCount} - 1`,
      lastErrorCode: jobErrorCodeMap.workerShutdown,
    })
    .where(activeLeaseCondition(lease))
    .returning({ jobId: job.jobId });
  return rowList.length > 0;
}

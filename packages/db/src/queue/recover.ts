import { type JobName, jobErrorCodeMap, jobPayloadSchema } from "@gizito/core";
import { and, eq, gte, lt, lte, notInArray } from "drizzle-orm";
import type { Executor } from "#src/client.ts";
import {
  compensateExhaustedJob,
  type ExhaustedJobHandler,
  JobCompensationError,
} from "#src/queue/exhausted.ts";
import { finishedPayloadSql } from "#src/queue/lease.ts";
import { job } from "#src/schema/job.ts";

export type RecoverExpiredJobsOptions = {
  now?: Date;
  onExhausted?: ExhaustedJobHandler;
};

export type CompensationFailure = {
  jobId: string;
  name: JobName;
  cause: unknown;
};

export type RecoverExpiredJobsResult = {
  requeuedCount: number;
  failedCount: number;
  compensationFailureList: CompensationFailure[];
};

type ExhaustedJobOutcome = "failed" | "none";

const releasedLockColumnMap = { lockedBy: null, lockExpireDatetime: null };

function expiredCondition(now: Date) {
  return and(eq(job.status, "active"), lte(job.lockExpireDatetime, now));
}

async function requeueExpiredJobs(executor: Executor, now: Date): Promise<number> {
  const rowList = await executor
    .update(job)
    .set({
      ...releasedLockColumnMap,
      lastErrorCode: jobErrorCodeMap.lockExpired,
      status: "pending",
      runAfterDatetime: now,
    })
    .where(and(expiredCondition(now), lt(job.attemptCount, job.maxAttemptCount)))
    .returning({ jobId: job.jobId });
  return rowList.length;
}

async function failNextExhaustedJob(
  executor: Executor,
  now: Date,
  skippedJobIdList: readonly string[],
  onExhausted: ExhaustedJobHandler | undefined,
): Promise<ExhaustedJobOutcome> {
  return executor.transaction(async (tx) => {
    const [row] = await tx
      .select({
        jobId: job.jobId,
        name: job.name,
        payload: job.payload,
        attemptCount: job.attemptCount,
      })
      .from(job)
      .where(
        and(
          expiredCondition(now),
          gte(job.attemptCount, job.maxAttemptCount),
          skippedJobIdList.length === 0 ? undefined : notInArray(job.jobId, [...skippedJobIdList]),
        ),
      )
      .orderBy(job.lockExpireDatetime)
      .limit(1)
      .for("update", { skipLocked: true });
    if (!row) return "none";
    const parsedPayload = jobPayloadSchema.safeParse(row.payload);
    const errorCode = parsedPayload.success
      ? jobErrorCodeMap.lockExpired
      : jobErrorCodeMap.payloadInvalid;
    await tx
      .update(job)
      .set({
        ...releasedLockColumnMap,
        lastErrorCode: errorCode,
        status: "failed",
        finishDatetime: now,
        payload: finishedPayloadSql(),
      })
      .where(eq(job.jobId, row.jobId));
    if (parsedPayload.success && onExhausted !== undefined) {
      await compensateExhaustedJob(tx, onExhausted, {
        jobId: row.jobId,
        name: row.name,
        payload: parsedPayload.data,
        attemptCount: row.attemptCount,
        errorCode,
      });
    }
    return "failed";
  });
}

export async function recoverExpiredJobs(
  executor: Executor,
  { now = new Date(), onExhausted }: RecoverExpiredJobsOptions = {},
): Promise<RecoverExpiredJobsResult> {
  const requeuedCount = await requeueExpiredJobs(executor, now);
  const compensationFailureList: CompensationFailure[] = [];
  const skippedJobIdList: string[] = [];
  let failedCount = 0;
  for (;;) {
    try {
      const outcome = await failNextExhaustedJob(executor, now, skippedJobIdList, onExhausted);
      if (outcome === "none") break;
      failedCount += 1;
    } catch (error) {
      if (!(error instanceof JobCompensationError)) throw error;
      skippedJobIdList.push(error.jobId);
      compensationFailureList.push({ jobId: error.jobId, name: error.jobName, cause: error.cause });
    }
  }
  return { requeuedCount, failedCount, compensationFailureList };
}

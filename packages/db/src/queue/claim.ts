import {
  type JobName,
  type JobPayload,
  jobLockExpireDatetime,
  jobPayloadSchema,
} from "@gizito/core";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import type { Executor } from "#src/client.ts";
import { jobErrorCodeMap } from "#src/queue/error-codes.ts";
import { failJob } from "#src/queue/finish.ts";
import type { JobLease } from "#src/queue/lease.ts";
import { job } from "#src/schema/job.ts";

export type ClaimJobOptions = {
  nameList: readonly JobName[];
  workerId: string;
  now?: Date;
  lockTimeoutSeconds?: number;
};

export type ClaimedJob = JobLease & {
  name: JobName;
  payload: JobPayload;
};

async function lockNextPendingJob(
  executor: Executor,
  {
    nameList,
    workerId,
    now,
    lockTimeoutSeconds,
  }: Required<Omit<ClaimJobOptions, "lockTimeoutSeconds">> &
    Pick<ClaimJobOptions, "lockTimeoutSeconds">,
) {
  const nextJobIdQuery = executor
    .select({ jobId: job.jobId })
    .from(job)
    .where(
      and(
        eq(job.status, "pending"),
        inArray(job.name, [...nameList]),
        lte(job.runAfterDatetime, now),
      ),
    )
    .orderBy(asc(job.runAfterDatetime), asc(job.insertDatetime))
    .limit(1)
    .for("update", { skipLocked: true });
  const [row] = await executor
    .update(job)
    .set({
      status: "active",
      lockedBy: workerId,
      lockExpireDatetime: jobLockExpireDatetime(now, lockTimeoutSeconds),
      attemptCount: sql`${job.attemptCount} + 1`,
    })
    .where(eq(job.jobId, sql`(${nextJobIdQuery})`))
    .returning({
      jobId: job.jobId,
      name: job.name,
      payload: job.payload,
      attemptCount: job.attemptCount,
      maxAttemptCount: job.maxAttemptCount,
    });
  return row ?? null;
}

export async function claimJob(
  executor: Executor,
  { nameList, workerId, now = new Date(), lockTimeoutSeconds }: ClaimJobOptions,
): Promise<ClaimedJob | null> {
  if (nameList.length === 0) return null;
  let row = await lockNextPendingJob(executor, { nameList, workerId, now, lockTimeoutSeconds });
  while (row) {
    const parsedPayload = jobPayloadSchema.safeParse(row.payload);
    if (parsedPayload.success) return { ...row, payload: parsedPayload.data };
    await failJob(
      executor,
      row,
      { errorCode: jobErrorCodeMap.payloadInvalid, retryable: false },
      { now },
    );
    row = await lockNextPendingJob(executor, { nameList, workerId, now, lockTimeoutSeconds });
  }
  return null;
}

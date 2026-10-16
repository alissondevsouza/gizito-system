import { type JobName, type JobPayload, jobPayloadSchema } from "@gizito/core";
import type { Executor } from "#src/client.ts";
import { activeSingletonPredicate, job } from "#src/schema/job.ts";

export type EnqueueJobOptions = {
  runAfterDatetime?: Date;
  maxAttemptCount?: number;
};

export type EnqueuedJob = {
  jobId: string;
  name: JobName;
  runAfterDatetime: Date;
};

const enqueuedJobColumnMap = {
  jobId: job.jobId,
  name: job.name,
  runAfterDatetime: job.runAfterDatetime,
};

function buildJobInsert(
  payload: JobPayload,
  { runAfterDatetime, maxAttemptCount }: EnqueueJobOptions,
  singletonKey?: string,
) {
  const parsedPayload = jobPayloadSchema.parse(payload);
  return {
    name: parsedPayload.name,
    payload: parsedPayload,
    singletonKey,
    maxAttemptCount,
    runAfterDatetime,
  };
}

export async function enqueueJob(
  executor: Executor,
  payload: JobPayload,
  options: EnqueueJobOptions = {},
): Promise<EnqueuedJob> {
  const [row] = await executor
    .insert(job)
    .values(buildJobInsert(payload, options))
    .returning(enqueuedJobColumnMap);
  if (!row) throw new Error("job insert returned no row");
  return row;
}

export async function enqueueSingletonJob(
  executor: Executor,
  payload: JobPayload,
  singletonKey: string,
  options: EnqueueJobOptions = {},
): Promise<EnqueuedJob | null> {
  const [row] = await executor
    .insert(job)
    .values(buildJobInsert(payload, options, singletonKey))
    .onConflictDoNothing({
      target: [job.name, job.singletonKey],
      where: activeSingletonPredicate(job),
    })
    .returning(enqueuedJobColumnMap);
  return row ?? null;
}

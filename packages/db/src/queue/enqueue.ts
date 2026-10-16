import { type JobName, type JobPayload, jobPayloadSchema } from "@gizito/core";
import type { Executor } from "#src/client.ts";
import { activeSingletonPredicate, job } from "#src/schema/job.ts";

export type EnqueueJobOptions = {
  runAfterDatetime?: Date;
  singletonKey?: string;
  maxAttemptCount?: number;
};

export type EnqueuedJob = {
  jobId: string;
  name: JobName;
  runAfterDatetime: Date;
};

export async function enqueueJob(
  executor: Executor,
  payload: JobPayload,
  { runAfterDatetime, singletonKey, maxAttemptCount }: EnqueueJobOptions = {},
): Promise<EnqueuedJob | null> {
  const parsedPayload = jobPayloadSchema.parse(payload);
  const [row] = await executor
    .insert(job)
    .values({
      name: parsedPayload.name,
      payload: parsedPayload,
      singletonKey,
      maxAttemptCount,
      runAfterDatetime,
    })
    .onConflictDoNothing({
      target: [job.name, job.singletonKey],
      where: activeSingletonPredicate(job),
    })
    .returning({ jobId: job.jobId, name: job.name, runAfterDatetime: job.runAfterDatetime });
  return row ?? null;
}

import { err, type JobName, jobErrorCodeMap, type OutcomeCode, type Result } from "@gizito/core";
import type { Executor } from "#src/client.ts";
import { type ClaimedJob, type ClaimJobOptions, claimJob } from "#src/queue/claim.ts";
import { completeJob, type FailJobOutcome, failJob, type JobFailure } from "#src/queue/finish.ts";

export type JobHandler = (claimedJob: ClaimedJob) => Promise<Result<unknown, JobFailure>>;

export type WorkJobOptions = Pick<
  ClaimJobOptions,
  "nameList" | "workerId" | "lockTimeoutSeconds" | "onPayloadInvalid"
> & {
  handler: JobHandler;
  clock?: () => Date;
};

export type WorkedJobOutcome = {
  outcome: "completed" | FailJobOutcome;
  jobId: string;
  name: JobName;
  attemptCount: number;
  errorCode: OutcomeCode | null;
  cause?: unknown;
};

export type WorkJobOutcome = { outcome: "idle" } | WorkedJobOutcome;

async function runHandler(
  handler: JobHandler,
  claimedJob: ClaimedJob,
): Promise<{ result: Result<unknown, JobFailure>; cause?: unknown }> {
  try {
    return { result: await handler(claimedJob) };
  } catch (cause) {
    return {
      result: err({ errorCode: jobErrorCodeMap.unhandledError, retryable: true }),
      cause,
    };
  }
}

export async function workJob(
  executor: Executor,
  {
    nameList,
    workerId,
    handler,
    clock = () => new Date(),
    lockTimeoutSeconds,
    onPayloadInvalid,
  }: WorkJobOptions,
): Promise<WorkJobOutcome> {
  const claimedJob = await claimJob(executor, {
    nameList,
    workerId,
    now: clock(),
    lockTimeoutSeconds,
    onPayloadInvalid,
  });
  if (!claimedJob) return { outcome: "idle" };
  const summary = {
    jobId: claimedJob.jobId,
    name: claimedJob.name,
    attemptCount: claimedJob.attemptCount,
  };
  const { result, cause } = await runHandler(handler, claimedJob);
  if (result.ok) {
    const completed = await completeJob(executor, claimedJob, { now: clock() });
    return { ...summary, outcome: completed ? "completed" : "lease_lost", errorCode: null };
  }
  const outcome = await failJob(executor, claimedJob, result.error, { now: clock() });
  return {
    ...summary,
    outcome,
    errorCode: result.error.errorCode,
    ...(cause === undefined ? {} : { cause }),
  };
}

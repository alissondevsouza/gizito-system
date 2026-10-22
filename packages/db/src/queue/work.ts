import {
  err,
  JOB_LEASE_RENEW_INTERVAL_SECONDS,
  JOB_MAX_RUN_SECONDS,
  type JobName,
  jobErrorCodeMap,
  nextJobRunAfterDatetime,
  type OutcomeCode,
  outcomeCodeSchema,
  type Result,
} from "@gizito/core";
import { and, eq } from "drizzle-orm";
import type { Executor, Transaction } from "#src/client.ts";
import { type ClaimedJob, type ClaimJobOptions, claimJob } from "#src/queue/claim.ts";
import { compensateExhaustedJob, type ExhaustedJobHandler } from "#src/queue/exhausted.ts";
import {
  completeJob,
  type FailJobOutcome,
  failJob,
  type JobFailure,
  releaseJob,
} from "#src/queue/finish.ts";
import { type JobLease, renewJobLease } from "#src/queue/lease.ts";
import { job } from "#src/schema/job.ts";

const MILLISECONDS_PER_SECOND = 1000;

export type JobHandlerContext = {
  signal: AbortSignal;
  completeWithin: (tx: Transaction) => Promise<boolean>;
};

export type JobHandler = (
  claimedJob: ClaimedJob,
  context: JobHandlerContext,
) => Promise<Result<unknown, JobFailure>>;

export type WorkJobOptions = Pick<
  ClaimJobOptions,
  "nameList" | "workerId" | "lockTimeoutSeconds" | "onPayloadInvalid"
> & {
  handler: JobHandler;
  onExhausted?: ExhaustedJobHandler;
  onLeaseRenewError?: (error: unknown) => void;
  clock?: () => Date;
  signal?: AbortSignal;
  leaseRenewIntervalMs?: number;
  maxRunMs?: number;
};

export type WorkedJobOutcome = {
  outcome: "completed" | "released" | FailJobOutcome;
  jobId: string;
  name: JobName;
  attemptCount: number;
  errorCode: OutcomeCode | null;
  cause?: unknown;
};

export type WorkJobOutcome = { outcome: "idle" } | WorkedJobOutcome;

type JobAbortReason = "shutdown" | "timeout" | "lease_lost";

type HandlerRun = {
  result: Result<unknown, JobFailure>;
  cause?: unknown;
  abortReason: JobAbortReason | null;
};

type LeaseKeeperOptions = Pick<
  WorkJobOptions,
  "lockTimeoutSeconds" | "onLeaseRenewError" | "signal"
> & {
  clock: () => Date;
  leaseRenewIntervalMs: number;
  maxRunMs: number;
  completeWithin: JobHandlerContext["completeWithin"];
};

async function runHandler(
  handler: JobHandler,
  claimedJob: ClaimedJob,
  context: JobHandlerContext,
): Promise<Omit<HandlerRun, "abortReason">> {
  try {
    return { result: await handler(claimedJob, context) };
  } catch (cause) {
    return {
      result: err({ errorCode: jobErrorCodeMap.unhandledError, retryable: true }),
      cause,
    };
  }
}

async function runWithLease(
  executor: Executor,
  claimedJob: ClaimedJob,
  handler: JobHandler,
  {
    clock,
    lockTimeoutSeconds,
    leaseRenewIntervalMs,
    maxRunMs,
    onLeaseRenewError,
    signal,
    completeWithin,
  }: LeaseKeeperOptions,
): Promise<HandlerRun> {
  const controller = new AbortController();
  let abortReason: JobAbortReason | null = null;
  let renewal: Promise<void> | null = null;
  const abort = (reason: JobAbortReason) => {
    if (abortReason !== null) return;
    abortReason = reason;
    controller.abort(reason);
  };
  const abortOnShutdown = () => abort("shutdown");
  const renewLease = () => {
    if (renewal !== null) return;
    renewal = renewJobLease(executor, claimedJob, { now: clock(), lockTimeoutSeconds })
      .then((renewed) => {
        if (!renewed) abort("lease_lost");
      })
      .catch((error: unknown) => onLeaseRenewError?.(error))
      .finally(() => {
        renewal = null;
      });
  };
  const renewTimer = setInterval(renewLease, leaseRenewIntervalMs);
  const deadlineTimer = setTimeout(() => {
    clearInterval(renewTimer);
    abort("timeout");
  }, maxRunMs);
  if (signal?.aborted) abortOnShutdown();
  signal?.addEventListener("abort", abortOnShutdown, { once: true });
  try {
    const run = await runHandler(handler, claimedJob, {
      signal: controller.signal,
      completeWithin,
    });
    return { ...run, abortReason };
  } finally {
    clearInterval(renewTimer);
    clearTimeout(deadlineTimer);
    signal?.removeEventListener("abort", abortOnShutdown);
    await renewal;
  }
}

function resolveFailure(failure: JobFailure, abortReason: JobAbortReason | null): JobFailure {
  if (failure.retryable && abortReason === "timeout") {
    return { errorCode: jobErrorCodeMap.jobTimeout, retryable: true };
  }
  if (outcomeCodeSchema.safeParse(failure.errorCode).success) return failure;
  return { errorCode: jobErrorCodeMap.invalidErrorCode, retryable: failure.retryable };
}

async function failWithCompensation(
  executor: Executor,
  claimedJob: ClaimedJob,
  failure: JobFailure,
  now: Date,
  onExhausted: ExhaustedJobHandler | undefined,
): Promise<FailJobOutcome> {
  const exhausted =
    failure.retryable &&
    nextJobRunAfterDatetime(claimedJob.attemptCount, now, claimedJob.maxAttemptCount) === null;
  if (!exhausted || onExhausted === undefined) {
    return failJob(executor, claimedJob, failure, { now });
  }
  return executor.transaction(async (tx) => {
    const outcome = await failJob(tx, claimedJob, failure, { now });
    if (outcome === "failed") {
      await compensateExhaustedJob(tx, onExhausted, {
        jobId: claimedJob.jobId,
        name: claimedJob.name,
        payload: claimedJob.payload,
        attemptCount: claimedJob.attemptCount,
        errorCode: failure.errorCode,
      });
    }
    return outcome;
  });
}

async function isCompletedAttempt(executor: Executor, lease: JobLease): Promise<boolean> {
  const [row] = await executor
    .select({ jobId: job.jobId })
    .from(job)
    .where(
      and(
        eq(job.jobId, lease.jobId),
        eq(job.attemptCount, lease.attemptCount),
        eq(job.status, "completed"),
      ),
    );
  return row !== undefined;
}

export async function workJob(
  executor: Executor,
  {
    nameList,
    workerId,
    handler,
    onExhausted,
    onLeaseRenewError,
    clock = () => new Date(),
    signal,
    lockTimeoutSeconds,
    leaseRenewIntervalMs = JOB_LEASE_RENEW_INTERVAL_SECONDS * MILLISECONDS_PER_SECOND,
    maxRunMs = JOB_MAX_RUN_SECONDS * MILLISECONDS_PER_SECOND,
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
  let calledCompleteWithin = false;
  const completeWithin = (tx: Transaction) => {
    calledCompleteWithin = true;
    return completeJob(tx, claimedJob, { now: clock() });
  };
  const { result, cause, abortReason } = await runWithLease(executor, claimedJob, handler, {
    clock,
    lockTimeoutSeconds,
    leaseRenewIntervalMs,
    maxRunMs,
    onLeaseRenewError,
    signal,
    completeWithin,
  });
  const causeEntry = cause === undefined ? {} : { cause };
  if (result.ok) {
    const completed =
      (await completeJob(executor, claimedJob, { now: clock() })) ||
      (calledCompleteWithin && (await isCompletedAttempt(executor, claimedJob)));
    return { ...summary, outcome: completed ? "completed" : "lease_lost", errorCode: null };
  }
  if (abortReason === "shutdown" && result.error.retryable) {
    const released = await releaseJob(executor, claimedJob, { now: clock() });
    return {
      ...summary,
      outcome: released ? "released" : "lease_lost",
      errorCode: jobErrorCodeMap.workerShutdown,
      ...causeEntry,
    };
  }
  const failure = resolveFailure(result.error, abortReason);
  const outcome = await failWithCompensation(executor, claimedJob, failure, clock(), onExhausted);
  return { ...summary, outcome, errorCode: failure.errorCode, ...causeEntry };
}

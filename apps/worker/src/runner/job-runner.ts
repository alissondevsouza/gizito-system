import { setTimeout as delay } from "node:timers/promises";
import { err, errorNameOf, jobErrorCodeMap } from "@gizito/core";
import {
  type Executor,
  type JobHandler,
  type WorkedJobOutcome,
  type WorkJobOutcome,
  workJob,
} from "@gizito/db";
import type { Logger } from "@gizito/integrations";
import type { JobHandlerMap, JobLane } from "#src/runner/lanes.ts";

export type JobRunnerState = "running" | "stopping" | "stopped";

export type JobRunner = {
  state: () => JobRunnerState;
  stop: () => Promise<void>;
};

export type StartJobRunnerOptions = {
  db: Executor;
  handlerMap: JobHandlerMap;
  laneList: readonly JobLane[];
  workerId: string;
  logger: Logger;
  pollIntervalMs?: number;
  errorBackoffMs?: number;
  clock?: () => Date;
};

export const DEFAULT_POLL_INTERVAL_MS = 1000;
export const DEFAULT_ERROR_BACKOFF_MS = 5000;
export const JOB_LOOP_FAILED_ERROR_CODE = "job_loop_failed";

type SlotIteration = "idle" | "worked" | "failed";

const outcomeLogLevelMap = {
  completed: "info",
  retry_scheduled: "warn",
  lease_lost: "warn",
  failed: "error",
} as const satisfies Record<WorkedJobOutcome["outcome"], "info" | "warn" | "error">;

async function pause(milliseconds: number, signal: AbortSignal): Promise<void> {
  try {
    await delay(milliseconds, undefined, { signal });
  } catch (error) {
    if (!signal.aborted) throw error;
  }
}

export function startJobRunner({
  db,
  handlerMap,
  laneList,
  workerId,
  logger,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  errorBackoffMs = DEFAULT_ERROR_BACKOFF_MS,
  clock = () => new Date(),
}: StartJobRunnerOptions): JobRunner {
  const controller = new AbortController();
  let state: JobRunnerState = "running";

  const dispatch: JobHandler = async (claimedJob) => {
    const handler = handlerMap[claimedJob.name];
    if (!handler) return err({ errorCode: jobErrorCodeMap.handlerNotFound, retryable: false });
    return handler(claimedJob);
  };

  function logOutcome(outcome: WorkedJobOutcome, orderId: string | undefined, durationMs: number) {
    const { cause, ...summary } = outcome;
    const entry = {
      jobId: summary.jobId,
      jobName: summary.name,
      orderId,
      attemptCount: summary.attemptCount,
      outcome: summary.outcome,
      errorCode: summary.errorCode,
      durationMs,
    };
    logger[outcomeLogLevelMap[summary.outcome]](entry, "job");
    if (cause !== undefined) logger.debug({ jobId: summary.jobId, err: cause }, "causa do job");
  }

  async function workOnce(lane: JobLane): Promise<SlotIteration> {
    const startTime = performance.now();
    let orderId: string | undefined;
    let outcome: WorkJobOutcome;
    try {
      outcome = await workJob(db, {
        nameList: lane.nameList,
        workerId,
        clock,
        handler: (claimedJob) => {
          orderId = "orderId" in claimedJob.payload ? claimedJob.payload.orderId : undefined;
          return dispatch(claimedJob);
        },
        onPayloadInvalid: ({ jobId, name }) =>
          logger.error(
            { jobId, jobName: name, errorCode: jobErrorCodeMap.payloadInvalid },
            "job com payload inválido",
          ),
      });
    } catch (error) {
      logger.error(
        { lane: lane.key, errorCode: JOB_LOOP_FAILED_ERROR_CODE, errorName: errorNameOf(error) },
        "falha no laço da fila",
      );
      logger.debug({ lane: lane.key, err: error }, "detalhe da falha no laço da fila");
      return "failed";
    }
    if (outcome.outcome === "idle") return "idle";
    logOutcome(outcome, orderId, Math.round(performance.now() - startTime));
    return "worked";
  }

  async function runSlot(lane: JobLane): Promise<void> {
    while (!controller.signal.aborted) {
      const iteration = await workOnce(lane);
      if (iteration === "idle") await pause(pollIntervalMs, controller.signal);
      if (iteration === "failed") await pause(errorBackoffMs, controller.signal);
    }
  }

  const slotPromiseList = laneList.flatMap((lane) =>
    Array.from({ length: lane.concurrency }, () => runSlot(lane)),
  );

  return {
    state: () => state,
    stop: async () => {
      if (state === "running") {
        state = "stopping";
        controller.abort();
      }
      await Promise.all(slotPromiseList);
      state = "stopped";
    },
  };
}

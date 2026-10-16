import {
  DATABASE_UNAVAILABLE_ERROR_CODE,
  errorNameOf,
  JOB_FAILED_METRIC_WINDOW_HOURS,
  type WorkerHealth,
} from "@gizito/core";
import { type Executor, getQueueMetrics } from "@gizito/db";
import type { Logger } from "@gizito/integrations";
import type { JobRunnerState } from "#src/runner/job-runner.ts";

const MILLISECONDS_PER_HOUR = 3600 * 1000;

export type ReadWorkerHealthOptions = {
  db: Executor;
  logger: Logger;
  runnerState: () => JobRunnerState;
  clock?: () => Date;
};

const unavailableHealth: WorkerHealth = { status: "unavailable", queue: null };

export async function readWorkerHealth({
  db,
  logger,
  runnerState,
  clock = () => new Date(),
}: ReadWorkerHealthOptions): Promise<WorkerHealth> {
  if (runnerState() !== "running") return unavailableHealth;
  const now = clock();
  try {
    const queue = await getQueueMetrics(db, {
      now,
      failedSinceDatetime: new Date(
        now.getTime() - JOB_FAILED_METRIC_WINDOW_HOURS * MILLISECONDS_PER_HOUR,
      ),
    });
    return { status: "ok", queue };
  } catch (error) {
    logger.warn(
      {
        errorCode: DATABASE_UNAVAILABLE_ERROR_CODE,
        errorName: errorNameOf(error),
      },
      "health sem banco",
    );
    return unavailableHealth;
  }
}

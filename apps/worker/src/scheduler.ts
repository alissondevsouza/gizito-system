import {
  CHARGE_RECONCILE_INTERVAL_MINUTES,
  errorNameOf,
  type JobName,
  type JobPayload,
  jobErrorCodeMap,
  RETENTION_PURGE_INTERVAL_HOURS,
} from "@gizito/core";
import {
  type Executor,
  type ExhaustedJobHandler,
  enqueueSingletonJob,
  recoverExpiredJobs,
} from "@gizito/db";
import type { Logger } from "@gizito/integrations";

const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

export const SCHEDULED_JOB_SINGLETON_KEY = "scheduled";
export const MAINTENANCE_INTERVAL_SECONDS = 30;
export const SCHEDULER_TASK_FAILED_ERROR_CODE = "scheduler_task_failed";

export type ScheduledJob = {
  payload: JobPayload;
  intervalSeconds: number;
};

export const scheduledJobList: readonly ScheduledJob[] = [
  {
    payload: { name: "charge.reconcile" },
    intervalSeconds: CHARGE_RECONCILE_INTERVAL_MINUTES * SECONDS_PER_MINUTE,
  },
  {
    payload: { name: "retention.purge" },
    intervalSeconds: RETENTION_PURGE_INTERVAL_HOURS * SECONDS_PER_HOUR,
  },
];

export type SchedulerDependencies = {
  db: Executor;
  logger: Logger;
  clock?: () => Date;
  onExhausted?: ExhaustedJobHandler;
};

export async function enqueueScheduledJob(
  { db, logger }: SchedulerDependencies,
  { payload }: ScheduledJob,
): Promise<void> {
  const enqueued = await enqueueSingletonJob(db, payload, SCHEDULED_JOB_SINGLETON_KEY);
  if (enqueued) logger.info({ jobId: enqueued.jobId, jobName: enqueued.name }, "job agendado");
  else logger.debug({ jobName: payload.name }, "job agendado já pendente");
}

export async function runMaintenance({
  db,
  logger,
  clock = () => new Date(),
  onExhausted,
}: SchedulerDependencies): Promise<void> {
  const { requeuedCount, failedCount, compensationFailureList } = await recoverExpiredJobs(db, {
    now: clock(),
    onExhausted,
  });
  if (requeuedCount + failedCount > 0) {
    logger.warn({ requeuedCount, failedCount }, "jobs com lock vencido recuperados");
  }
  for (const { jobId, name, cause } of compensationFailureList) {
    logger.error(
      {
        jobId,
        jobName: name,
        errorCode: jobErrorCodeMap.compensationFailed,
        errorName: errorNameOf(cause),
      },
      "falha na compensação do job esgotado",
    );
    logger.debug({ jobId, err: cause }, "detalhe da falha na compensação");
  }
}

export type Scheduler = {
  stop: () => Promise<void>;
};

export type StartSchedulerOptions = SchedulerDependencies & {
  handledNameList: readonly JobName[];
  maintenanceIntervalSeconds?: number;
};

type ScheduledTask = {
  name: string;
  intervalSeconds: number;
  run: () => Promise<void>;
};

export function startScheduler({
  handledNameList,
  maintenanceIntervalSeconds = MAINTENANCE_INTERVAL_SECONDS,
  ...dependencies
}: StartSchedulerOptions): Scheduler {
  const taskList: ScheduledTask[] = [
    {
      name: "maintenance",
      intervalSeconds: maintenanceIntervalSeconds,
      run: () => runMaintenance(dependencies),
    },
    ...scheduledJobList
      .filter((scheduledJob) => handledNameList.includes(scheduledJob.payload.name))
      .map((scheduledJob) => ({
        name: scheduledJob.payload.name,
        intervalSeconds: scheduledJob.intervalSeconds,
        run: () => enqueueScheduledJob(dependencies, scheduledJob),
      })),
  ];
  const runningTaskMap = new Map<string, Promise<void>>();

  function runTask(task: ScheduledTask) {
    if (runningTaskMap.has(task.name)) return;
    const running = task
      .run()
      .catch((error: unknown) => {
        dependencies.logger.error(
          {
            task: task.name,
            errorCode: SCHEDULER_TASK_FAILED_ERROR_CODE,
            errorName: errorNameOf(error),
          },
          "falha no agendador",
        );
        dependencies.logger.debug({ task: task.name, err: error }, "detalhe da falha no agendador");
      })
      .finally(() => runningTaskMap.delete(task.name));
    runningTaskMap.set(task.name, running);
  }

  const intervalList = taskList.map((task) => {
    runTask(task);
    return setInterval(() => runTask(task), task.intervalSeconds * MILLISECONDS_PER_SECOND);
  });

  return {
    stop: async () => {
      for (const interval of intervalList) clearInterval(interval);
      await Promise.all(runningTaskMap.values());
    },
  };
}

import { type JobName, jobNameList } from "@gizito/core";
import type { ExhaustedJobHandler, JobHandler } from "@gizito/db";

export type JobDefinition = {
  handle: JobHandler;
  onExhausted?: ExhaustedJobHandler;
};

export type JobHandlerMap = Partial<Record<JobName, JobDefinition>>;

export type JobLaneKey =
  | "generate"
  | "charge_reconcile"
  | "retention_purge"
  | "analyze"
  | "default";

export type JobLane = {
  key: JobLaneKey;
  nameList: readonly JobName[];
  concurrency: number;
};

export const DEFAULT_LANE_CONCURRENCY = 2;
export const CHARGE_RECONCILE_LANE_CONCURRENCY = 2;
export const CONNECTIONS_PER_SLOT = 2;
export const EXTRA_CONNECTION_COUNT = 2;

export function listHandledJobNames(handlerMap: JobHandlerMap): JobName[] {
  return jobNameList.filter((name) => handlerMap[name] !== undefined);
}

export function buildJobLaneList(
  handledNameList: readonly JobName[],
  { generateConcurrency }: { generateConcurrency: number },
): JobLane[] {
  const laneList: JobLane[] = [
    { key: "generate", nameList: ["order.generate"], concurrency: generateConcurrency },
    {
      key: "charge_reconcile",
      nameList: ["charge.reconcile"],
      concurrency: CHARGE_RECONCILE_LANE_CONCURRENCY,
    },
    { key: "retention_purge", nameList: ["retention.purge"], concurrency: 1 },
    { key: "analyze", nameList: ["order.analyze"], concurrency: DEFAULT_LANE_CONCURRENCY },
    {
      key: "default",
      nameList: ["order.notify", "whatsapp.inbound"],
      concurrency: DEFAULT_LANE_CONCURRENCY,
    },
  ];
  return laneList
    .map((lane) => ({
      ...lane,
      nameList: lane.nameList.filter((name) => handledNameList.includes(name)),
    }))
    .filter((lane) => lane.nameList.length > 0);
}

export function countWorkerConnections(laneList: readonly JobLane[]): number {
  const slotCount = laneList.reduce((total, lane) => total + lane.concurrency, 0);
  return slotCount * CONNECTIONS_PER_SLOT + EXTRA_CONNECTION_COUNT;
}

export function buildExhaustedJobDispatcher(handlerMap: JobHandlerMap): ExhaustedJobHandler {
  return async (tx, exhaustedJob) => {
    await handlerMap[exhaustedJob.name]?.onExhausted?.(tx, exhaustedJob);
  };
}

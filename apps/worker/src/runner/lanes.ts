import { type JobName, jobNameList } from "@gizito/core";
import type { JobHandler } from "@gizito/db";

export type JobHandlerMap = Partial<Record<JobName, JobHandler>>;

export type JobLaneKey = "generate" | "charge_reconcile" | "retention_purge" | "default";

export type JobLane = {
  key: JobLaneKey;
  nameList: readonly JobName[];
  concurrency: number;
};

export const DEFAULT_LANE_CONCURRENCY = 2;

export function listHandledJobNames(handlerMap: JobHandlerMap): JobName[] {
  return jobNameList.filter((name) => handlerMap[name] !== undefined);
}

export function buildJobLaneList(
  handledNameList: readonly JobName[],
  { generateConcurrency }: { generateConcurrency: number },
): JobLane[] {
  const laneList: JobLane[] = [
    { key: "generate", nameList: ["order.generate"], concurrency: generateConcurrency },
    { key: "charge_reconcile", nameList: ["charge.reconcile"], concurrency: 1 },
    { key: "retention_purge", nameList: ["retention.purge"], concurrency: 1 },
    {
      key: "default",
      nameList: ["order.analyze", "order.notify", "whatsapp.inbound"],
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

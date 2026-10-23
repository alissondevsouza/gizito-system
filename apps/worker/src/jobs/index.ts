import type { JobName } from "@gizito/core";
import {
  type ChargeReconcileDependencies,
  createChargeReconcileJob,
} from "#src/jobs/charge-reconcile.ts";
import { createOrderAnalyzeJob, type OrderAnalyzeDependencies } from "#src/jobs/order-analyze.ts";
import type { JobDefinition } from "#src/runner/lanes.ts";

export const handledJobNameList = [
  "order.analyze",
  "charge.reconcile",
] as const satisfies readonly JobName[];
export type HandledJobName = (typeof handledJobNameList)[number];

export type JobDependencies = OrderAnalyzeDependencies & ChargeReconcileDependencies;

export function buildJobHandlerMap(
  dependencies: JobDependencies,
): Record<HandledJobName, JobDefinition> {
  return {
    "order.analyze": createOrderAnalyzeJob(dependencies),
    "charge.reconcile": createChargeReconcileJob(dependencies),
  };
}

import { z } from "zod";

export const DATABASE_UNAVAILABLE_ERROR_CODE = "database_unavailable";

export const healthStatusList = ["ok", "unavailable"] as const;
export const healthStatusSchema = z.enum(healthStatusList);
export type HealthStatus = z.infer<typeof healthStatusSchema>;

export const apiHealthSchema = z.object({ status: healthStatusSchema });
export type ApiHealth = z.infer<typeof apiHealthSchema>;

const countSchema = z.number().int().nonnegative();

export const queueMetricsSchema = z.object({
  readyCount: countSchema,
  oldestReadyAgeSeconds: countSchema.nullable(),
  activeCount: countSchema,
  failedCount: countSchema,
  payloadInvalidCount: countSchema,
});
export type QueueMetrics = z.infer<typeof queueMetricsSchema>;

export const workerHealthSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), queue: queueMetricsSchema }),
  z.object({ status: z.literal("unavailable"), queue: z.null() }),
]);
export type WorkerHealth = z.infer<typeof workerHealthSchema>;

import { portSchema, sharedEnvironmentSchema } from "@gizito/core";
import { z } from "zod";

export const DEFAULT_WORKER_HEALTH_PORT = 3002;
export const DEFAULT_GENERATE_CONCURRENCY = 2;

export const workerConfigSchema = sharedEnvironmentSchema.extend({
  WORKER_HEALTH_PORT: portSchema.default(DEFAULT_WORKER_HEALTH_PORT),
  GENERATE_CONCURRENCY: z.coerce.number().int().min(1).default(DEFAULT_GENERATE_CONCURRENCY),
});
export type WorkerConfig = z.infer<typeof workerConfigSchema>;

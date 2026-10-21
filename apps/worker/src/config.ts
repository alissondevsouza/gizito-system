import {
  checkProductionEnvironment,
  paymentEnvironmentSchema,
  portSchema,
  sharedEnvironmentSchema,
} from "@gizito/core";
import { z } from "zod";

export const DEFAULT_WORKER_HEALTH_PORT = 3002;
export const DEFAULT_GENERATE_CONCURRENCY = 2;
export const MAX_GENERATE_CONCURRENCY = 8;
export const DEFAULT_RENDER_CONCURRENCY = 2;
export const MAX_RENDER_CONCURRENCY = 8;

export const workerConfigSchema = sharedEnvironmentSchema
  .extend({
    ...paymentEnvironmentSchema.shape,
    WORKER_HEALTH_PORT: portSchema.default(DEFAULT_WORKER_HEALTH_PORT),
    GENERATE_CONCURRENCY: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_GENERATE_CONCURRENCY)
      .default(DEFAULT_GENERATE_CONCURRENCY),
    RENDER_CONCURRENCY: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_RENDER_CONCURRENCY)
      .default(DEFAULT_RENDER_CONCURRENCY),
  })
  .superRefine(checkProductionEnvironment);
export type WorkerConfig = z.infer<typeof workerConfigSchema>;

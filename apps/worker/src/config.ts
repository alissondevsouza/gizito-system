import {
  aiEnvironmentSchema,
  checkProductionEnvironment,
  checkStorageProductionEnvironment,
  paymentEnvironmentSchema,
  portSchema,
  sharedEnvironmentSchema,
  storageEnvironmentSchema,
} from "@gizito/core";
import { findModelPrice } from "@gizito/integrations";
import { z } from "zod";

export const DEFAULT_WORKER_HEALTH_PORT = 3002;
export const DEFAULT_GENERATE_CONCURRENCY = 2;
export const MAX_GENERATE_CONCURRENCY = 8;
export const DEFAULT_RENDER_CONCURRENCY = 2;
export const MAX_RENDER_CONCURRENCY = 8;

export const UNKNOWN_AI_MODEL_MESSAGE = "modelo de IA sem preço na tabela do adaptador";

const aiModelKeyList = ["AI_MODEL_EXTRACT", "AI_MODEL_GENERATE"] as const;

export const workerConfigSchema = sharedEnvironmentSchema
  .extend({
    ...paymentEnvironmentSchema.shape,
    ...aiEnvironmentSchema.shape,
    ...storageEnvironmentSchema.shape,
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
  .superRefine((environment, context) => {
    checkProductionEnvironment(environment, context);
    checkStorageProductionEnvironment(environment, context);
    for (const key of aiModelKeyList) {
      if (findModelPrice(environment[key]) === null) {
        context.addIssue({ code: "custom", path: [key], message: UNKNOWN_AI_MODEL_MESSAGE });
      }
    }
  });
export type WorkerConfig = z.infer<typeof workerConfigSchema>;

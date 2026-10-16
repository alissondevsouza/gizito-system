import {
  FAKE_GATEWAY_IN_PRODUCTION_MESSAGE,
  isPaymentGatewayAllowed,
  paymentEnvironmentSchema,
  portSchema,
  sharedEnvironmentSchema,
} from "@gizito/core";
import { z } from "zod";

export const DEFAULT_WORKER_HEALTH_PORT = 3002;
export const DEFAULT_GENERATE_CONCURRENCY = 2;

export const workerConfigSchema = sharedEnvironmentSchema
  .extend({
    ...paymentEnvironmentSchema.shape,
    WORKER_HEALTH_PORT: portSchema.default(DEFAULT_WORKER_HEALTH_PORT),
    GENERATE_CONCURRENCY: z.coerce.number().int().min(1).default(DEFAULT_GENERATE_CONCURRENCY),
  })
  .refine(isPaymentGatewayAllowed, {
    path: ["PAYMENT_GATEWAY"],
    message: FAKE_GATEWAY_IN_PRODUCTION_MESSAGE,
  });
export type WorkerConfig = z.infer<typeof workerConfigSchema>;

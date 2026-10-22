import {
  checkProductionEnvironment,
  checkStorageProductionEnvironment,
  checkTrustedProxyProductionEnvironment,
  clientHashEnvironmentSchema,
  paymentEnvironmentSchema,
  portSchema,
  sharedEnvironmentSchema,
  storageEnvironmentSchema,
  trustedProxyEnvironmentSchema,
} from "@gizito/core";
import { z } from "zod";

export const DEFAULT_API_PORT = 3001;

export const apiConfigSchema = sharedEnvironmentSchema
  .extend({
    ...paymentEnvironmentSchema.shape,
    ...storageEnvironmentSchema.shape,
    ...clientHashEnvironmentSchema.shape,
    ...trustedProxyEnvironmentSchema.shape,
    API_PORT: portSchema.default(DEFAULT_API_PORT),
    WEB_PUBLIC_URL: z.url({ protocol: /^https?$/ }),
  })
  .superRefine((environment, context) => {
    checkProductionEnvironment(environment, context);
    checkStorageProductionEnvironment(environment, context);
    checkTrustedProxyProductionEnvironment(environment, context);
  });
export type ApiConfig = z.infer<typeof apiConfigSchema>;

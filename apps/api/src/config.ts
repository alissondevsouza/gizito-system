import {
  FAKE_GATEWAY_IN_PRODUCTION_MESSAGE,
  isPaymentGatewayAllowed,
  paymentEnvironmentSchema,
  portSchema,
  sharedEnvironmentSchema,
} from "@gizito/core";
import { z } from "zod";

export const DEFAULT_API_PORT = 3001;

export const apiConfigSchema = sharedEnvironmentSchema
  .extend({
    ...paymentEnvironmentSchema.shape,
    API_PORT: portSchema.default(DEFAULT_API_PORT),
    WEB_PUBLIC_URL: z.url({ protocol: /^https?$/ }),
  })
  .refine(isPaymentGatewayAllowed, {
    path: ["PAYMENT_GATEWAY"],
    message: FAKE_GATEWAY_IN_PRODUCTION_MESSAGE,
  });
export type ApiConfig = z.infer<typeof apiConfigSchema>;

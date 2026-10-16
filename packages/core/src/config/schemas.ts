import { z } from "zod";
import { type PaymentGatewayName, paymentGatewaySchema } from "#src/enums.ts";

export const nodeEnvList = ["development", "test", "production"] as const;
export const nodeEnvSchema = z.enum(nodeEnvList);
export type NodeEnv = z.infer<typeof nodeEnvSchema>;

export const logLevelList = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;
export const logLevelSchema = z.enum(logLevelList);
export type LogLevel = z.infer<typeof logLevelSchema>;

export const portSchema = z.coerce.number().int().min(1).max(65535);

export const postgresUrlSchema = z.url({ protocol: /^postgres(ql)?$/ });

export const sharedEnvironmentSchema = z.object({
  NODE_ENV: nodeEnvSchema.default("development"),
  LOG_LEVEL: logLevelSchema.default("info"),
  DATABASE_URL: postgresUrlSchema,
  HOST: z.string().min(1).default("127.0.0.1"),
});
export type SharedEnvironment = z.infer<typeof sharedEnvironmentSchema>;

export const paymentEnvironmentSchema = z.object({
  PAYMENT_GATEWAY: paymentGatewaySchema.default("fake"),
});

export const FAKE_GATEWAY_IN_PRODUCTION_MESSAGE =
  "PAYMENT_GATEWAY=fake não é permitido com NODE_ENV=production";

export function isPaymentGatewayAllowed({
  NODE_ENV,
  PAYMENT_GATEWAY,
}: {
  NODE_ENV: NodeEnv;
  PAYMENT_GATEWAY: PaymentGatewayName;
}): boolean {
  return !(NODE_ENV === "production" && PAYMENT_GATEWAY === "fake");
}

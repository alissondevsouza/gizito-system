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
  NODE_ENV: nodeEnvSchema,
  LOG_LEVEL: logLevelSchema.default("info"),
  DATABASE_URL: postgresUrlSchema,
  HOST: z.string().min(1).default("127.0.0.1"),
});
export type SharedEnvironment = z.infer<typeof sharedEnvironmentSchema>;

export const paymentEnvironmentSchema = z.object({
  PAYMENT_GATEWAY: paymentGatewaySchema,
});

export const productionDebugLogLevelList = [
  "debug",
  "trace",
] as const satisfies readonly LogLevel[];

export const FAKE_GATEWAY_IN_PRODUCTION_MESSAGE =
  "PAYMENT_GATEWAY=fake não é permitido com NODE_ENV=production";
export const DEBUG_LOG_IN_PRODUCTION_MESSAGE =
  "LOG_LEVEL=debug ou trace não é permitido com NODE_ENV=production";

type GuardedEnvironment = {
  NODE_ENV: NodeEnv;
  LOG_LEVEL: LogLevel;
  PAYMENT_GATEWAY: PaymentGatewayName;
};

export function isPaymentGatewayAllowed({
  NODE_ENV,
  PAYMENT_GATEWAY,
}: Pick<GuardedEnvironment, "NODE_ENV" | "PAYMENT_GATEWAY">): boolean {
  return !(NODE_ENV === "production" && PAYMENT_GATEWAY === "fake");
}

export function isLogLevelAllowed({
  NODE_ENV,
  LOG_LEVEL,
}: Pick<GuardedEnvironment, "NODE_ENV" | "LOG_LEVEL">): boolean {
  const isDebugLevel = productionDebugLogLevelList.some((level) => level === LOG_LEVEL);
  return !(NODE_ENV === "production" && isDebugLevel);
}

export type EnvironmentIssueSink = {
  addIssue: (issue: { code: "custom"; path: string[]; message: string }) => void;
};

export function checkProductionEnvironment(
  environment: GuardedEnvironment,
  context: EnvironmentIssueSink,
): void {
  if (!isPaymentGatewayAllowed(environment)) {
    context.addIssue({
      code: "custom",
      path: ["PAYMENT_GATEWAY"],
      message: FAKE_GATEWAY_IN_PRODUCTION_MESSAGE,
    });
  }
  if (!isLogLevelAllowed(environment)) {
    context.addIssue({
      code: "custom",
      path: ["LOG_LEVEL"],
      message: DEBUG_LOG_IN_PRODUCTION_MESSAGE,
    });
  }
}

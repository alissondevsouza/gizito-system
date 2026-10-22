import { z } from "zod";
import { webUrlSchema } from "#src/common.ts";
import { MAX_TRUSTED_PROXY_HOP_COUNT } from "#src/constants.ts";
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

export const DEFAULT_STORAGE_REGION = "auto";
export const MIN_CLIENT_HASH_SECRET_LENGTH = 32;

export const storageEnvironmentSchema = z.object({
  R2_ENDPOINT: webUrlSchema,
  R2_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/),
  R2_REGION: z.string().trim().min(1).default(DEFAULT_STORAGE_REGION),
  R2_ACCESS_KEY_ID: z.string().trim().min(1),
  R2_SECRET_ACCESS_KEY: z.string().trim().min(1),
});
export type StorageEnvironment = z.infer<typeof storageEnvironmentSchema>;

export const clientHashEnvironmentSchema = z.object({
  CLIENT_HASH_SECRET: z.string().min(MIN_CLIENT_HASH_SECRET_LENGTH),
});

export const trustedProxyEnvironmentSchema = z.object({
  TRUSTED_PROXY_HOP_COUNT: z.coerce
    .number()
    .int()
    .min(0)
    .max(MAX_TRUSTED_PROXY_HOP_COUNT)
    .default(0),
});

export const aiEffortList = ["low", "medium", "high", "xhigh", "max"] as const;
export const aiEffortSchema = z.enum(aiEffortList);
export type AiEffort = z.infer<typeof aiEffortSchema>;

export const aiModelSettingSchema = z.object({
  model: z.string().trim().min(1),
  effort: aiEffortSchema.optional(),
});
export type AiModelSetting = z.infer<typeof aiModelSettingSchema>;

export const aiEnvironmentSchema = z.object({
  AI_API_KEY: z.string().trim().min(1),
  AI_MODEL_EXTRACT: z.string().trim().min(1),
  AI_MODEL_GENERATE: z.string().trim().min(1),
  AI_EFFORT_EXTRACT: aiEffortSchema.optional(),
  AI_EFFORT_GENERATE: aiEffortSchema.optional(),
});
export type AiEnvironment = z.infer<typeof aiEnvironmentSchema>;

export const productionDebugLogLevelList = [
  "debug",
  "trace",
] as const satisfies readonly LogLevel[];

export const FAKE_GATEWAY_IN_PRODUCTION_MESSAGE =
  "PAYMENT_GATEWAY=fake não é permitido com NODE_ENV=production";
export const DEBUG_LOG_IN_PRODUCTION_MESSAGE =
  "LOG_LEVEL=debug ou trace não é permitido com NODE_ENV=production";
export const INSECURE_STORAGE_IN_PRODUCTION_MESSAGE =
  "R2_ENDPOINT precisa ser https com NODE_ENV=production";
export const MISSING_PROXY_HOP_IN_PRODUCTION_MESSAGE =
  "TRUSTED_PROXY_HOP_COUNT precisa ser 1 ou mais com NODE_ENV=production (a api fica atrás do proxy)";

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

export function isStorageEndpointAllowed({
  NODE_ENV,
  R2_ENDPOINT,
}: { NODE_ENV: NodeEnv } & Pick<StorageEnvironment, "R2_ENDPOINT">): boolean {
  return !(NODE_ENV === "production" && new URL(R2_ENDPOINT).protocol !== "https:");
}

export function checkStorageProductionEnvironment(
  environment: { NODE_ENV: NodeEnv } & Pick<StorageEnvironment, "R2_ENDPOINT">,
  context: EnvironmentIssueSink,
): void {
  if (!isStorageEndpointAllowed(environment)) {
    context.addIssue({
      code: "custom",
      path: ["R2_ENDPOINT"],
      message: INSECURE_STORAGE_IN_PRODUCTION_MESSAGE,
    });
  }
}

export function isTrustedProxyHopCountAllowed({
  NODE_ENV,
  TRUSTED_PROXY_HOP_COUNT,
}: {
  NODE_ENV: NodeEnv;
  TRUSTED_PROXY_HOP_COUNT: number;
}): boolean {
  return !(NODE_ENV === "production" && TRUSTED_PROXY_HOP_COUNT === 0);
}

export function checkTrustedProxyProductionEnvironment(
  environment: { NODE_ENV: NodeEnv; TRUSTED_PROXY_HOP_COUNT: number },
  context: EnvironmentIssueSink,
): void {
  if (!isTrustedProxyHopCountAllowed(environment)) {
    context.addIssue({
      code: "custom",
      path: ["TRUSTED_PROXY_HOP_COUNT"],
      message: MISSING_PROXY_HOP_IN_PRODUCTION_MESSAGE,
    });
  }
}

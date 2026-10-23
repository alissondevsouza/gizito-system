import { z } from "zod";
import type { Result } from "#src/result.ts";

export const aiUsageSchema = z.object({
  inputTokens: z.int().min(0),
  outputTokens: z.int().min(0),
  costCents: z.number().min(0),
});
export type AiUsage = z.infer<typeof aiUsageSchema>;

export const aiImageMediaTypeList = ["image/jpeg", "image/png"] as const;
export const aiImageSchema = z.object({
  mediaType: z.enum(aiImageMediaTypeList),
  data: z.instanceof(Uint8Array),
});
export type AiImage = z.infer<typeof aiImageSchema>;

export type AiRequest<T> = {
  readonly promptVersion: string;
  readonly systemPrompt: string;
  readonly userText: string;
  readonly imageList?: readonly AiImage[];
  readonly outputSchema: z.ZodType<T>;
  readonly maxOutputTokens?: number;
  readonly signal?: AbortSignal;
};

export type AiResult<T> = {
  readonly output: T;
  readonly usage: AiUsage;
  readonly model: string;
  readonly promptVersion: string;
  readonly durationMs: number;
};

export const aiFailureCodeList = [
  "ai_timeout",
  "ai_rate_limited",
  "ai_unavailable",
  "ai_aborted",
  "ai_auth_failed",
  "ai_request_invalid",
  "ai_image_invalid",
  "ai_refused",
  "ai_output_truncated",
  "ai_output_invalid",
] as const;
export const aiFailureCodeSchema = z.enum(aiFailureCodeList);
export type AiFailureCode = z.infer<typeof aiFailureCodeSchema>;

export const retryableAiFailureCodeList = [
  "ai_timeout",
  "ai_rate_limited",
  "ai_unavailable",
  "ai_aborted",
] as const satisfies readonly AiFailureCode[];

export function isRetryableAiFailureCode(code: AiFailureCode): boolean {
  return retryableAiFailureCodeList.some((retryableCode) => retryableCode === code);
}

export const aiProviderIncidentCodeList = [
  "ai_auth_failed",
  "ai_request_invalid",
] as const satisfies readonly AiFailureCode[];
export type AiProviderIncidentCode = (typeof aiProviderIncidentCodeList)[number];

export function isAiProviderIncidentCode(code: string): code is AiProviderIncidentCode {
  return aiProviderIncidentCodeList.some((incidentCode) => incidentCode === code);
}

export const invalidOutputAiFailureCodeList = [
  "ai_refused",
  "ai_output_truncated",
  "ai_output_invalid",
] as const satisfies readonly AiFailureCode[];

export function isInvalidOutputAiFailureCode(code: AiFailureCode): boolean {
  return invalidOutputAiFailureCodeList.some((invalidCode) => invalidCode === code);
}

export type AiFailure = {
  readonly code: AiFailureCode;
  readonly usage: AiUsage | null;
  readonly model: string;
  readonly promptVersion: string;
  readonly durationMs: number;
};

export type AiCallResult<T> = Result<AiResult<T>, AiFailure>;

export interface AiProvider {
  extract<T>(request: AiRequest<T>): Promise<AiCallResult<T>>;
  plan<T>(request: AiRequest<T>): Promise<AiCallResult<T>>;
  generate<T>(request: AiRequest<T>): Promise<AiCallResult<T>>;
  review<T>(request: AiRequest<T>): Promise<AiCallResult<T>>;
}

import { z } from "zod";

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
};

export type AiResult<T> = {
  readonly output: T;
  readonly usage: AiUsage;
  readonly model: string;
  readonly promptVersion: string;
  readonly durationMs: number;
};

export interface AiProvider {
  extract<T>(request: AiRequest<T>): Promise<AiResult<T>>;
  plan<T>(request: AiRequest<T>): Promise<AiResult<T>>;
  generate<T>(request: AiRequest<T>): Promise<AiResult<T>>;
  review<T>(request: AiRequest<T>): Promise<AiResult<T>>;
}

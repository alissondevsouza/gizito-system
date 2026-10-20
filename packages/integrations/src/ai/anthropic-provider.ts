import Anthropic from "@anthropic-ai/sdk";
import {
  type AiCallResult,
  type AiEffort,
  type AiFailureCode,
  type AiImage,
  type AiModelSetting,
  type AiProvider,
  type AiRequest,
  type AiStage,
  type AiUsage,
  err,
  ok,
  type Result,
} from "@gizito/core";
import type { z } from "zod";
import { reduceImage } from "#src/ai/image.ts";
import { toOutputJsonSchema } from "#src/ai/output-schema.ts";
import { findModelPrice, type ModelPrice, usageOf } from "#src/ai/pricing.ts";
import type { Logger } from "#src/logger.ts";

export const DEFAULT_AI_TIMEOUT_MS = 10 * 60 * 1000;
export const DEFAULT_AI_MAX_RETRIES = 2;

export const defaultMaxOutputTokensByStage: Readonly<Record<AiStage, number>> = {
  extract: 16_000,
  plan: 32_000,
  generate: 64_000,
  review: 32_000,
};

const DEFAULT_EXTRACT_EFFORT: AiEffort = "medium";
const DEFAULT_GENERATE_EFFORT: AiEffort = "high";

export type AnthropicProviderConfig = {
  readonly apiKey: string;
  readonly extract: AiModelSetting;
  readonly generate: AiModelSetting;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  readonly now?: () => number;
  readonly logger?: Logger;
};

export class UnknownAiModelError extends Error {
  constructor(readonly model: string) {
    super(`modelo de IA sem preço na tabela: ${model}`);
    this.name = "UnknownAiModelError";
  }
}

type StageModel = {
  readonly model: string;
  readonly effort: AiEffort;
  readonly price: ModelPrice;
};

type ProviderContext = {
  readonly client: Anthropic;
  readonly now: () => number;
  readonly logger: Logger | undefined;
};

function stageModelOf(setting: AiModelSetting, defaultEffort: AiEffort): StageModel {
  const price = findModelPrice(setting.model);
  if (price === null) throw new UnknownAiModelError(setting.model);
  return { model: setting.model, effort: setting.effort ?? defaultEffort, price };
}

const STATUS_PAYMENT_REQUIRED = 402;
const STATUS_SERVER_ERROR_FLOOR = 500;
const requestInvalidStatusList: readonly number[] = [400, 404, 413, 422];

function failureCodeOfStatus(status: number | undefined): AiFailureCode {
  if (status === undefined || status >= STATUS_SERVER_ERROR_FLOOR) return "ai_unavailable";
  if (status === STATUS_PAYMENT_REQUIRED) return "ai_auth_failed";
  return requestInvalidStatusList.includes(status) ? "ai_request_invalid" : "ai_unavailable";
}

function failureCodeOfError(error: unknown): AiFailureCode | null {
  if (error instanceof Anthropic.APIUserAbortError) return "ai_aborted";
  if (error instanceof Anthropic.APIConnectionTimeoutError) return "ai_timeout";
  if (error instanceof Anthropic.APIConnectionError) return "ai_unavailable";
  if (error instanceof Anthropic.RateLimitError) return "ai_rate_limited";
  if (error instanceof Anthropic.AuthenticationError) return "ai_auth_failed";
  if (error instanceof Anthropic.PermissionDeniedError) return "ai_auth_failed";
  if (error instanceof Anthropic.APIError) return failureCodeOfStatus(error.status);
  return null;
}

async function imageBlockListOf(
  imageList: readonly AiImage[],
): Promise<Result<Anthropic.ImageBlockParam[], "ai_image_invalid">> {
  const reducedList = await Promise.all(imageList.map(reduceImage));
  const blockList: Anthropic.ImageBlockParam[] = [];
  for (const reduced of reducedList) {
    if (!reduced.ok) return reduced;
    blockList.push({
      type: "image",
      source: {
        type: "base64",
        media_type: reduced.value.mediaType,
        data: Buffer.from(reduced.value.data).toString("base64"),
      },
    });
  }
  return ok(blockList);
}

function usageOfMessage(price: ModelPrice, usage: Anthropic.Usage): AiUsage {
  const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
  const cacheWrite1hTokens = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  return usageOf(price, {
    uncachedInputTokens: usage.input_tokens,
    cacheWrite5mTokens: cacheWriteTokens - cacheWrite1hTokens,
    cacheWrite1hTokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    outputTokens: usage.output_tokens,
  });
}

function parseJson(text: string): Result<unknown, null> {
  try {
    return ok(JSON.parse(text));
  } catch {
    return err(null);
  }
}

function parseOutput<T>(message: Anthropic.Message, schema: z.ZodType<T>): Result<T, null> {
  const text = message.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");
  const json = parseJson(text);
  if (!json.ok) return json;
  const parsed = schema.safeParse(json.value);
  return parsed.success ? ok(parsed.data) : err(null);
}

const truncatedStopReasonList: readonly (string | null)[] = [
  "max_tokens",
  "model_context_window_exceeded",
];

async function streamMessage<T>(
  context: ProviderContext,
  stage: AiStage,
  stageModel: StageModel,
  request: AiRequest<T>,
  imageBlockList: readonly Anthropic.ImageBlockParam[],
): Promise<Result<Anthropic.Message, AiFailureCode>> {
  try {
    const stream = context.client.messages.stream(
      {
        model: stageModel.model,
        max_tokens: request.maxOutputTokens ?? defaultMaxOutputTokensByStage[stage],
        thinking: { type: "adaptive" },
        output_config: {
          effort: stageModel.effort,
          format: { type: "json_schema", schema: toOutputJsonSchema(request.outputSchema) },
        },
        system: [
          { type: "text", text: request.systemPrompt, cache_control: { type: "ephemeral" } },
        ],
        messages: [
          {
            role: "user",
            content: [...imageBlockList, { type: "text", text: request.userText }],
          },
        ],
      },
      { signal: request.signal },
    );
    return ok(await stream.finalMessage());
  } catch (error) {
    const code = failureCodeOfError(error);
    if (code === null) throw error;
    context.logger?.debug(
      {
        stage,
        model: stageModel.model,
        code,
        status: error instanceof Anthropic.APIError ? error.status : undefined,
        vendorMessage: error instanceof Error ? error.message : undefined,
      },
      "ai_call_failed",
    );
    return err(code);
  }
}

async function callModel<T>(
  context: ProviderContext,
  stage: AiStage,
  stageModel: StageModel,
  request: AiRequest<T>,
): Promise<AiCallResult<T>> {
  const startTime = context.now();
  const failure = (code: AiFailureCode, usage: AiUsage | null, model: string) =>
    err({
      code,
      usage,
      model,
      promptVersion: request.promptVersion,
      durationMs: context.now() - startTime,
    });
  const imageBlockList = await imageBlockListOf(request.imageList ?? []);
  if (!imageBlockList.ok) return failure(imageBlockList.error, null, stageModel.model);
  const streamed = await streamMessage(context, stage, stageModel, request, imageBlockList.value);
  if (!streamed.ok) return failure(streamed.error, null, stageModel.model);
  const message = streamed.value;
  const usage = usageOfMessage(stageModel.price, message.usage);
  if (message.stop_reason === "refusal") return failure("ai_refused", usage, message.model);
  if (truncatedStopReasonList.includes(message.stop_reason)) {
    return failure("ai_output_truncated", usage, message.model);
  }
  const output = parseOutput(message, request.outputSchema);
  if (!output.ok) return failure("ai_output_invalid", usage, message.model);
  return ok({
    output: output.value,
    usage,
    model: message.model,
    promptVersion: request.promptVersion,
    durationMs: context.now() - startTime,
  });
}

export function createAnthropicProvider(config: AnthropicProviderConfig): AiProvider {
  const extractModel = stageModelOf(config.extract, DEFAULT_EXTRACT_EFFORT);
  const generateModel = stageModelOf(config.generate, DEFAULT_GENERATE_EFFORT);
  const context: ProviderContext = {
    client: new Anthropic({
      apiKey: config.apiKey,
      timeout: config.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS,
      maxRetries: config.maxRetries ?? DEFAULT_AI_MAX_RETRIES,
      fetch: config.fetch,
    }),
    now: config.now ?? (() => performance.now()),
    logger: config.logger,
  };
  return {
    extract: (request) => callModel(context, "extract", extractModel, request),
    plan: (request) => callModel(context, "plan", generateModel, request),
    generate: (request) => callModel(context, "generate", generateModel, request),
    review: (request) => callModel(context, "review", generateModel, request),
  };
}

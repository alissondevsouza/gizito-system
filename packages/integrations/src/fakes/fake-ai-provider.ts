import {
  type AiCallResult,
  type AiFailureCode,
  type AiProvider,
  type AiRequest,
  type AiStage,
  type AiUsage,
  err,
  ok,
} from "@gizito/core";
import { reduceImage } from "#src/ai/image.ts";
import { findModelPrice, usageOf } from "#src/ai/pricing.ts";

const CHARACTERS_PER_TOKEN = 4;
const TOKENS_PER_IMAGE = 1600;
const FAKE_DURATION_MS = 1;

const outputFailureCodeList: readonly AiFailureCode[] = [
  "ai_refused",
  "ai_output_truncated",
  "ai_output_invalid",
];

export type FakeAiResponse =
  | { readonly kind: "output"; readonly output: unknown }
  | { readonly kind: "failure"; readonly code: AiFailureCode };

export type FakeAiResponder = (request: AiRequest<unknown>) => FakeAiResponse;

export type FakeAiRequestRecord = {
  readonly stage: AiStage;
  readonly request: AiRequest<unknown>;
};

export type FakeAiProvider = AiProvider & {
  enqueueOutput(stage: AiStage, output: unknown): void;
  enqueueFailure(stage: AiStage, code: AiFailureCode): void;
  respondWith(stage: AiStage, responder: FakeAiResponder): void;
  readonly requestList: readonly FakeAiRequestRecord[];
};

export type FakeAiProviderOption = {
  readonly extractModel?: string;
  readonly generateModel?: string;
};

function tokenCountOfText(text: string): number {
  return Math.ceil(text.length / CHARACTERS_PER_TOKEN);
}

export function createFakeAiProvider({
  extractModel = "claude-haiku-5-5",
  generateModel = "claude-sonnet-5-5",
}: FakeAiProviderOption = {}): FakeAiProvider {
  const queueByStage = new Map<AiStage, FakeAiResponse[]>();
  const responderByStage = new Map<AiStage, FakeAiResponder>();
  const requestList: FakeAiRequestRecord[] = [];
  const enqueue = (stage: AiStage, response: FakeAiResponse) => {
    queueByStage.set(stage, [...(queueByStage.get(stage) ?? []), response]);
  };
  const usageFor = (model: string, request: AiRequest<unknown>, output: unknown): AiUsage => {
    const price = findModelPrice(model);
    if (price === null) throw new Error(`modelo do fake sem preço: ${model}`);
    return usageOf(price, {
      uncachedInputTokens:
        tokenCountOfText(request.systemPrompt + request.userText) +
        (request.imageList?.length ?? 0) * TOKENS_PER_IMAGE,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
      cacheReadTokens: 0,
      outputTokens: tokenCountOfText(JSON.stringify(output) ?? ""),
    });
  };
  const respond = async <T>(
    stage: AiStage,
    model: string,
    request: AiRequest<T>,
  ): Promise<AiCallResult<T>> => {
    requestList.push({ stage, request });
    const failure = (code: AiFailureCode, usage: AiUsage | null) =>
      err({
        code,
        usage,
        model,
        promptVersion: request.promptVersion,
        durationMs: FAKE_DURATION_MS,
      });
    if (request.signal?.aborted) return failure("ai_aborted", null);
    const reducedList = await Promise.all((request.imageList ?? []).map(reduceImage));
    if (reducedList.some((reduced) => !reduced.ok)) return failure("ai_image_invalid", null);
    const [queued, ...rest] = queueByStage.get(stage) ?? [];
    queueByStage.set(stage, rest);
    const next = queued ?? responderByStage.get(stage)?.(request);
    if (next === undefined) throw new Error(`fake de IA sem resposta enfileirada para ${stage}`);
    if (next.kind === "failure") {
      const usage = outputFailureCodeList.includes(next.code)
        ? usageFor(model, request, null)
        : null;
      return failure(next.code, usage);
    }
    const usage = usageFor(model, request, next.output);
    const parsed = request.outputSchema.safeParse(next.output);
    if (!parsed.success) return failure("ai_output_invalid", usage);
    return ok({
      output: parsed.data,
      usage,
      model,
      promptVersion: request.promptVersion,
      durationMs: FAKE_DURATION_MS,
    });
  };
  return {
    extract: (request) => respond("extract", extractModel, request),
    plan: (request) => respond("plan", generateModel, request),
    generate: (request) => respond("generate", generateModel, request),
    review: (request) => respond("review", generateModel, request),
    enqueueOutput: (stage, output) => enqueue(stage, { kind: "output", output }),
    enqueueFailure: (stage, code) => enqueue(stage, { kind: "failure", code }),
    respondWith: (stage, responder) => {
      responderByStage.set(stage, responder);
    },
    requestList,
  };
}

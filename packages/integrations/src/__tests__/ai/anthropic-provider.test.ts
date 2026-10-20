import { describe, expect, it } from "bun:test";
import type { AiFailureCode, AiImage, AiRequest } from "@gizito/core";
import sharp from "sharp";
import { z } from "zod";
import {
  errorResponse,
  messageSseResponse,
  midStreamErrorResponse,
  partialSseResponse,
  type RecordedMessage,
} from "#src/__tests__/ai/sse.ts";
import {
  type AnthropicProviderConfig,
  createAnthropicProvider,
  UnknownAiModelError,
} from "#src/ai/anthropic-provider.ts";
import { createMemoryLogger } from "#src/fakes/memory-logger.ts";

type JsonRecord = Record<string, unknown>;

type CapturedRequest = {
  readonly url: string;
  readonly body: JsonRecord;
  readonly headers: Headers;
};

const wordSchema = z.strictObject({ word: z.string().min(2) });

function recordedMessage(override: Partial<RecordedMessage> = {}): RecordedMessage {
  return {
    model: "claude-sonnet-5-5",
    text: JSON.stringify({ word: "gizito" }),
    stopReason: "end_turn",
    inputTokens: 1000,
    outputTokens: 500,
    ...override,
  };
}

function wordRequest(override: Partial<AiRequest<{ word: string }>> = {}) {
  return {
    promptVersion: "generate-v1",
    systemPrompt: "regras fixas",
    userText: "dados do pedido",
    outputSchema: wordSchema,
    ...override,
  } satisfies AiRequest<{ word: string }>;
}

type ResponseStep = (signal: AbortSignal | null | undefined) => Response | Promise<Response>;

function createHarness(
  stepList: readonly ResponseStep[],
  override: Partial<AnthropicProviderConfig> = {},
) {
  const capturedList: CapturedRequest[] = [];
  let clock = 0;
  const memoryLogger = createMemoryLogger();
  const provider = createAnthropicProvider({
    apiKey: "chave-de-teste",
    extract: { model: "claude-haiku-5-5" },
    generate: { model: "claude-sonnet-5-5" },
    maxRetries: 0,
    now: () => {
      clock += 7;
      return clock;
    },
    logger: memoryLogger.logger,
    fetch: async (input, init) => {
      const step = stepList[capturedList.length] ?? stepList.at(-1);
      capturedList.push({
        url: String(input instanceof Request ? input.url : input),
        body: JSON.parse(String(init?.body ?? "{}")),
        headers: new Headers(init?.headers),
      });
      if (step === undefined) throw new Error("sem resposta gravada");
      return step(init?.signal);
    },
    ...override,
  });
  return { provider, capturedList, memoryLogger };
}

const respondWith =
  (message: RecordedMessage): ResponseStep =>
  () =>
    messageSseResponse(message);

async function syntheticPng(width: number, height: number): Promise<AiImage["data"]> {
  return Uint8Array.from(
    await sharp({ create: { width, height, channels: 3, background: { r: 250, g: 250, b: 240 } } })
      .png()
      .toBuffer(),
  );
}

function failureCodeOf(result: { ok: boolean; error?: { code: AiFailureCode } }) {
  return result.ok ? null : result.error?.code;
}

describe("adaptador Anthropic: requisição (spec F1-05, RF-05)", () => {
  it.each([
    ["extract", "claude-haiku-5-5", "medium", 16_000],
    ["plan", "claude-sonnet-5-5", "high", 32_000],
    ["generate", "claude-sonnet-5-5", "high", 64_000],
    ["review", "claude-sonnet-5-5", "high", 32_000],
  ] as const)(
    "%s usa %s com esforço %s e %d tokens de saída",
    async (stage, model, effort, maxTokens) => {
      const { provider, capturedList } = createHarness([respondWith(recordedMessage({ model }))]);
      const result = await provider[stage](wordRequest());
      expect(result.ok && result.value.output).toEqual({ word: "gizito" });
      const body = capturedList[0]?.body ?? {};
      expect(capturedList[0]?.url).toContain("/v1/messages");
      expect(body.model).toBe(model);
      expect(body.max_tokens).toBe(maxTokens);
      expect(body.stream).toBe(true);
      expect(body.thinking).toEqual({ type: "adaptive" });
      const outputConfig = body.output_config as JsonRecord;
      expect(outputConfig.effort).toBe(effort);
      if (stage === "generate") {
        expect(outputConfig.format).toBeUndefined();
      } else {
        const format = outputConfig.format as JsonRecord;
        expect(format.type).toBe("json_schema");
        expect((format.schema as JsonRecord).additionalProperties).toBe(false);
      }
      expect(body.system).toEqual([
        { type: "text", text: "regras fixas", cache_control: { type: "ephemeral" } },
      ]);
      expect(body.messages).toEqual([
        { role: "user", content: [{ type: "text", text: "dados do pedido" }] },
      ]);
    },
  );

  it("usa o esforço e o limite de saída pedidos", async () => {
    const { provider, capturedList } = createHarness([respondWith(recordedMessage())], {
      generate: { model: "claude-sonnet-5-5", effort: "medium" },
    });
    await provider.generate(wordRequest({ maxOutputTokens: 2048 }));
    const body = capturedList[0]?.body ?? {};
    expect(body.max_tokens).toBe(2048);
    expect((body.output_config as JsonRecord).effort).toBe("medium");
  });

  it("reduz a foto e manda em base64 JPEG antes do texto", async () => {
    const { provider, capturedList } = createHarness([
      respondWith(recordedMessage({ model: "claude-haiku-5-5" })),
    ]);
    const result = await provider.extract(
      wordRequest({
        imageList: [{ mediaType: "image/png", data: await syntheticPng(4000, 3000) }],
      }),
    );
    expect(result.ok).toBe(true);
    const messageList = (capturedList[0]?.body.messages ?? []) as JsonRecord[];
    const content = (messageList[0]?.content ?? []) as JsonRecord[];
    expect(content.map((block) => block.type)).toEqual(["image", "text"]);
    const source = content[0]?.source as JsonRecord;
    expect(source.type).toBe("base64");
    expect(source.media_type).toBe("image/jpeg");
    const metadata = await sharp(Buffer.from(String(source.data), "base64")).metadata();
    expect([metadata.width, metadata.height, metadata.format]).toEqual([1600, 1200, "jpeg"]);
  });

  it("foto ilegível dá ai_image_invalid sem chamar a API", async () => {
    const { provider, capturedList } = createHarness([respondWith(recordedMessage())]);
    const result = await provider.extract(
      wordRequest({ imageList: [{ mediaType: "image/jpeg", data: new Uint8Array([1, 2, 3]) }] }),
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: "ai_image_invalid",
        usage: null,
        model: "claude-haiku-5-5",
        promptVersion: "generate-v1",
        durationMs: 7,
      },
    });
    expect(capturedList).toHaveLength(0);
  });

  it("modelo sem preço na tabela é recusado na construção", () => {
    expect(() =>
      createAnthropicProvider({
        apiKey: "chave-de-teste",
        extract: { model: "claude-haiku-4-5" },
        generate: { model: "claude-sonnet-5-5" },
      }),
    ).toThrow(UnknownAiModelError);
  });
});

describe("adaptador Anthropic: resposta (spec F1-05, RF-05)", () => {
  it("devolve saída, usage com custo em centavos de dólar, modelo, versão e duração", async () => {
    const { provider } = createHarness([
      respondWith(recordedMessage({ cacheWriteTokens: 2000, cacheReadTokens: 3000 })),
    ]);
    const result = await provider.generate(wordRequest());
    expect(result).toEqual({
      ok: true,
      value: {
        output: { word: "gizito" },
        usage: { inputTokens: 6000, outputTokens: 500, costCents: 0.2 + 0.5 + 0.06 + 0.5 },
        model: "claude-sonnet-5-5",
        promptVersion: "generate-v1",
        durationMs: 7,
      },
    });
  });

  it.each<[string, Partial<RecordedMessage>, AiFailureCode]>([
    ["recusa", { stopReason: "refusal" }, "ai_refused"],
    ["corte por max_tokens", { stopReason: "max_tokens" }, "ai_output_truncated"],
    ["janela de contexto", { stopReason: "model_context_window_exceeded" }, "ai_output_truncated"],
    ["texto que não é JSON", { text: "não é json" }, "ai_output_invalid"],
    ["JSON fora do schema", { text: JSON.stringify({ word: "g" }) }, "ai_output_invalid"],
    ["chave a mais", { text: JSON.stringify({ word: "gizito", extra: 1 }) }, "ai_output_invalid"],
  ])("%s dá %s com o usage gasto", async (_, override, code) => {
    const { provider } = createHarness([respondWith(recordedMessage(override))]);
    const result = await provider.generate(wordRequest());
    expect(failureCodeOf(result)).toBe(code);
    expect(result.ok ? null : result.error.usage).toEqual({
      inputTokens: 1000,
      outputTokens: 500,
      costCents: 0.7,
    });
  });

  it.each<[number, string, AiFailureCode]>([
    [400, "invalid_request_error", "ai_request_invalid"],
    [401, "authentication_error", "ai_auth_failed"],
    [402, "billing_error", "ai_auth_failed"],
    [403, "permission_error", "ai_auth_failed"],
    [404, "not_found_error", "ai_request_invalid"],
    [413, "request_too_large", "ai_request_invalid"],
    [422, "invalid_request_error", "ai_request_invalid"],
    [429, "rate_limit_error", "ai_rate_limited"],
    [500, "api_error", "ai_unavailable"],
    [529, "overloaded_error", "ai_unavailable"],
  ])("HTTP %d (%s) dá %s sem usage", async (status, errorType, code) => {
    const { provider, memoryLogger } = createHarness([() => errorResponse(status, errorType)]);
    const result = await provider.generate(wordRequest());
    expect(result.ok ? null : result.error).toEqual({
      code,
      usage: null,
      model: "claude-sonnet-5-5",
      promptVersion: "generate-v1",
      durationMs: 7,
    });
    const entry = memoryLogger
      .readEntryList()
      .find((logEntry) => logEntry.msg === "ai_call_failed");
    expect(entry?.status).toBe(status);
    expect(entry?.code).toBe(code);
    expect(JSON.stringify(memoryLogger.readEntryList())).not.toContain("dados do pedido");
  });

  it("falha de rede dá ai_unavailable", async () => {
    const { provider } = createHarness([
      () => {
        throw new TypeError("fetch failed");
      },
    ]);
    expect(failureCodeOf(await provider.generate(wordRequest()))).toBe("ai_unavailable");
  });

  it("erro no meio do streaming dá ai_unavailable", async () => {
    const { provider } = createHarness([() => midStreamErrorResponse("overloaded_error")]);
    expect(failureCodeOf(await provider.generate(wordRequest()))).toBe("ai_unavailable");
  });

  it("estouro do timeout dá ai_timeout", async () => {
    const neverResponds: ResponseStep = (signal) =>
      new Promise<Response>((_, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason));
      });
    const { provider } = createHarness([neverResponds], { timeoutMs: 20 });
    expect(failureCodeOf(await provider.generate(wordRequest()))).toBe("ai_timeout");
  });

  it("signal cancelado dá ai_aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const { provider } = createHarness([respondWith(recordedMessage())]);
    const result = await provider.generate(wordRequest({ signal: controller.signal }));
    expect(failureCodeOf(result)).toBe("ai_aborted");
  });

  it("o SDK repete o 529 e a segunda tentativa passa", async () => {
    const { provider, capturedList } = createHarness(
      [() => errorResponse(529, "overloaded_error"), respondWith(recordedMessage())],
      { maxRetries: 1 },
    );
    const result = await provider.generate(wordRequest());
    expect(result.ok).toBe(true);
    expect(capturedList).toHaveLength(2);
  });

  it("schema que não vira JSON Schema é bug e propaga", async () => {
    const { provider } = createHarness([respondWith(recordedMessage())]);
    await expect(
      provider.plan({ ...wordRequest(), outputSchema: z.strictObject({ when: z.date() }) }),
    ).rejects.toThrow();
  });
});

describe("adaptador Anthropic: correções da revisão (spec F1-05, RF-05)", () => {
  const partialText = '{"word": "giz'.padEnd(400, "x");

  it.each([
    ["conexão fechada sem message_stop", "close"],
    ["stream que falha no meio", "error"],
  ] as const)("%s dá ai_unavailable com o usage parcial", async (_, ending) => {
    const { provider } = createHarness([() => partialSseResponse(partialText, ending)]);
    const result = await provider.generate(wordRequest());
    expect(result.ok ? null : result.error.code).toBe("ai_unavailable");
    expect(result.ok ? null : result.error.usage?.inputTokens).toBe(1000);
    expect(result.ok ? null : result.error.usage?.outputTokens).toBe(100);
  });

  it("cancelamento no meio do stream dá ai_aborted com o usage parcial", async () => {
    const controller = new AbortController();
    const { provider } = createHarness([
      (signal) => {
        setTimeout(() => controller.abort(), 20);
        return partialSseResponse(partialText, "hang", signal);
      },
    ]);
    const result = await provider.generate(wordRequest({ signal: controller.signal }));
    expect(result.ok ? null : result.error.code).toBe("ai_aborted");
    expect(result.ok ? null : result.error.usage?.inputTokens).toBe(1000);
  });

  it.each<[number, AiFailureCode]>([
    [405, "ai_request_invalid"],
    [410, "ai_request_invalid"],
    [451, "ai_request_invalid"],
    [408, "ai_unavailable"],
    [409, "ai_unavailable"],
  ])("HTTP %d dá %s", async (status, code) => {
    const { provider } = createHarness([() => errorResponse(status, "error")]);
    expect(failureCodeOf(await provider.generate(wordRequest()))).toBe(code);
  });

  it("duração sai inteira mesmo com relógio fracionário", async () => {
    const instantList = [0.4, 34.25];
    const { provider } = createHarness([respondWith(recordedMessage())], {
      now: () => instantList.shift() ?? 0,
    });
    const result = await provider.generate(wordRequest());
    expect(result.ok && result.value.durationMs).toBe(34);
  });

  it("ignora as variáveis de ambiente do SDK", async () => {
    const savedEnvironment = { ...process.env };
    process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:9";
    process.env.ANTHROPIC_AUTH_TOKEN = "token-do-ambiente";
    try {
      const { provider, capturedList } = createHarness([respondWith(recordedMessage())]);
      await provider.generate(wordRequest());
      expect(capturedList[0]?.url.startsWith("https://api.anthropic.com/")).toBe(true);
      expect(capturedList[0]?.headers.get("authorization")).toBeNull();
      expect(capturedList[0]?.headers.get("x-api-key")).toBe("chave-de-teste");
    } finally {
      process.env = savedEnvironment;
    }
  });
});

describe("adaptador Anthropic: saída estruturada por etapa (spec F1-05, RF-05)", () => {
  it("generate pede JSON em texto e valida pelo Zod do mesmo jeito", async () => {
    const { provider, capturedList } = createHarness([
      respondWith(recordedMessage({ text: JSON.stringify({ word: "g" }) })),
    ]);
    const result = await provider.generate(wordRequest());
    const outputConfig = (capturedList[0]?.body.output_config ?? {}) as JsonRecord;
    expect(outputConfig.format).toBeUndefined();
    expect(result.ok ? null : result.error.code).toBe("ai_output_invalid");
  });

  it("JSON cercado por markdown é saída inválida, sem parse tolerante", async () => {
    const { provider } = createHarness([
      respondWith(recordedMessage({ text: '```json\n{"word": "gizito"}\n```' })),
    ]);
    expect(failureCodeOf(await provider.generate(wordRequest()))).toBe("ai_output_invalid");
  });

  it("a lista de etapas com saída estruturada é configurável", async () => {
    const { provider, capturedList } = createHarness([respondWith(recordedMessage())], {
      structuredOutputStageList: ["generate"],
    });
    await provider.generate(wordRequest());
    const outputConfig = (capturedList[0]?.body.output_config ?? {}) as JsonRecord;
    const format = (outputConfig.format ?? {}) as JsonRecord;
    expect(format.type).toBe("json_schema");
  });
});

import { describe, expect, it } from "bun:test";
import {
  aiEnvironmentSchema,
  kitContentSchemaBySubject,
  kitPlanSchema,
  kitRepairSchemaBySubject,
  photoExtractionSchema,
  reviewResultSchema,
} from "@gizito/core";
import type { z } from "zod";
import { describeAiProviderContract } from "#src/__tests__/ai/contract.ts";
import { createAnthropicProvider } from "#src/ai/anthropic-provider.ts";

const LIVE_TEST_TIMEOUT_MS = 180_000;
const SCHEMA_PROBE_MAX_OUTPUT_TOKENS = 64;

const liveEnvironment =
  process.env.AI_LIVE_TEST === "1" ? aiEnvironmentSchema.safeParse(process.env) : null;

function createLiveProvider() {
  if (!liveEnvironment?.success) throw new Error("AI_LIVE_TEST=1 e chave da IA são obrigatórios");
  const environment = liveEnvironment.data;
  return createAnthropicProvider({
    apiKey: environment.AI_API_KEY,
    extract: { model: environment.AI_MODEL_EXTRACT, effort: environment.AI_EFFORT_EXTRACT },
    generate: { model: environment.AI_MODEL_GENERATE, effort: environment.AI_EFFORT_GENERATE },
  });
}

const coreOutputSchemaByName: Readonly<Record<string, z.ZodType>> = {
  photoExtraction: photoExtractionSchema,
  kitPlan: kitPlanSchema,
  mathKitContent: kitContentSchemaBySubject.math,
  portugueseKitContent: kitContentSchemaBySubject.portuguese,
  mathKitRepair: kitRepairSchemaBySubject.math,
  portugueseKitRepair: kitRepairSchemaBySubject.portuguese,
  reviewResult: reviewResultSchema,
};

it.if(process.env.AI_LIVE_TEST === "1")("test:ai-live encontra o ambiente da IA completo", () => {
  const missingKeyList = liveEnvironment?.success
    ? []
    : (liveEnvironment?.error.issues ?? []).map((issue) => issue.path.join("."));
  expect(missingKeyList).toEqual([]);
});

describe.skipIf(!liveEnvironment?.success)("API real da Anthropic (test:ai-live)", () => {
  describeAiProviderContract("Anthropic", {
    createDriver: () => ({ provider: createLiveProvider(), arrange: () => {} }),
    testTimeoutMs: LIVE_TEST_TIMEOUT_MS,
  });

  it.each(Object.entries(coreOutputSchemaByName))(
    "a API aceita o schema de saída %s",
    async (name, outputSchema) => {
      const result = await createLiveProvider().generate({
        promptVersion: `${name}-schema-probe`,
        systemPrompt: "Você testa a integração do Gizito.",
        userText: "Gere um exemplo curto que siga o formato pedido.",
        outputSchema,
        maxOutputTokens: SCHEMA_PROBE_MAX_OUTPUT_TOKENS,
      });
      expect(result.ok ? "ok" : result.error.code).not.toBe("ai_request_invalid");
    },
    LIVE_TEST_TIMEOUT_MS,
  );
});

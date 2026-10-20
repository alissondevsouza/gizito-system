import { describe, expect, it } from "bun:test";
import {
  type AiStage,
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

const coreOutputSchemaList: readonly (readonly [string, AiStage, z.ZodType])[] = [
  ["photoExtraction", "extract", photoExtractionSchema],
  ["kitPlan", "plan", kitPlanSchema],
  ["mathKitContent", "generate", kitContentSchemaBySubject.math],
  ["portugueseKitContent", "generate", kitContentSchemaBySubject.portuguese],
  ["mathKitRepair", "generate", kitRepairSchemaBySubject.math],
  ["portugueseKitRepair", "generate", kitRepairSchemaBySubject.portuguese],
  ["reviewResult", "review", reviewResultSchema],
];

describe.skipIf(!liveEnvironment?.success)("API real da Anthropic (test:ai-live)", () => {
  describeAiProviderContract("Anthropic", {
    createDriver: () => ({ provider: createLiveProvider(), arrange: () => {} }),
    testTimeoutMs: LIVE_TEST_TIMEOUT_MS,
  });

  it.each(coreOutputSchemaList)(
    "a API aceita o schema de saída %s na etapa %s",
    async (name, stage, outputSchema) => {
      const result = await createLiveProvider()[stage]({
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

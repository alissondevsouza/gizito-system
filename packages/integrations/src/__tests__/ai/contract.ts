import { describe, expect, it } from "bun:test";
import {
  type AiImage,
  type AiProvider,
  type AiRequest,
  type AiStage,
  aiStageList,
  isRetryableAiFailureCode,
} from "@gizito/core";
import sharp from "sharp";
import { z } from "zod";

export const echoOutput = { word: "gizito" } as const;

export const echoSchema = z.strictObject({ word: z.string().min(2).max(20) });

export const impossibleSchema = z
  .strictObject({ word: z.string() })
  .refine((output) => output.word === "palavra-que-nunca-sai");

export type ContractScenario = "echo" | "invalid" | "truncated";

export type AiContractDriver = {
  readonly provider: AiProvider;
  readonly arrange: (stage: AiStage, scenario: ContractScenario) => void;
};

export type AiContractSetup = {
  readonly createDriver: () => AiContractDriver;
  readonly testTimeoutMs: number;
};

const ECHO_SYSTEM_PROMPT =
  "Você testa a integração do Gizito. Responda só com o JSON pedido, sem comentar.";

const echoUserText = `Devolva exatamente este objeto JSON: ${JSON.stringify(echoOutput)}`;

const truncatedUserText =
  "Escreva no campo word um texto longo, com pelo menos quinhentas palavras sobre frações.";

const TRUNCATED_MAX_OUTPUT_TOKENS = 16;

export async function syntheticNotebookImage(): Promise<AiImage> {
  const buffer = await sharp({
    create: { width: 1200, height: 900, channels: 3, background: { r: 252, g: 252, b: 245 } },
  })
    .png()
    .toBuffer();
  return { mediaType: "image/png", data: Uint8Array.from(buffer) };
}

function echoRequest(stage: AiStage): AiRequest<{ word: string }> {
  return {
    promptVersion: `${stage}-contract`,
    systemPrompt: ECHO_SYSTEM_PROMPT,
    userText: echoUserText,
    outputSchema: echoSchema,
  };
}

export function describeAiProviderContract(
  name: string,
  { createDriver, testTimeoutMs }: AiContractSetup,
) {
  describe(`contrato do AiProvider: ${name} (spec F1-05, RF-07)`, () => {
    for (const stage of aiStageList) {
      it(
        `${stage} devolve a saída validada com usage, modelo, versão e duração`,
        async () => {
          const driver = createDriver();
          driver.arrange(stage, "echo");
          const result = await driver.provider[stage](echoRequest(stage));
          if (!result.ok) throw new Error(`falhou com ${result.error.code}`);
          expect(result.value.output).toEqual(echoOutput);
          expect(result.value.usage.inputTokens).toBeGreaterThan(0);
          expect(result.value.usage.outputTokens).toBeGreaterThan(0);
          expect(result.value.usage.costCents).toBeGreaterThan(0);
          expect(result.value.model.length).toBeGreaterThan(0);
          expect(result.value.promptVersion).toBe(`${stage}-contract`);
          expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
        },
        testTimeoutMs,
      );
    }

    it(
      "extração com foto devolve a saída validada",
      async () => {
        const driver = createDriver();
        driver.arrange("extract", "echo");
        const result = await driver.provider.extract({
          ...echoRequest("extract"),
          imageList: [await syntheticNotebookImage()],
        });
        expect(result.ok && result.value.output).toEqual(echoOutput);
      },
      testTimeoutMs,
    );

    it(
      "saída fora do schema é ai_output_invalid com o usage gasto",
      async () => {
        const driver = createDriver();
        driver.arrange("generate", "invalid");
        const result = await driver.provider.generate({
          ...echoRequest("generate"),
          outputSchema: impossibleSchema,
        });
        expect(result.ok ? null : result.error.code).toBe("ai_output_invalid");
        expect(result.ok ? null : result.error.usage?.outputTokens).toBeGreaterThan(0);
      },
      testTimeoutMs,
    );

    it(
      "saída cortada pelo limite é ai_output_truncated com o usage gasto",
      async () => {
        const driver = createDriver();
        driver.arrange("generate", "truncated");
        const result = await driver.provider.generate({
          ...echoRequest("generate"),
          userText: truncatedUserText,
          maxOutputTokens: TRUNCATED_MAX_OUTPUT_TOKENS,
        });
        expect(result.ok ? null : result.error.code).toBe("ai_output_truncated");
        expect(result.ok ? null : result.error.usage).not.toBeNull();
      },
      testTimeoutMs,
    );

    it(
      "signal cancelado é ai_aborted e volta à fila",
      async () => {
        const driver = createDriver();
        const controller = new AbortController();
        controller.abort();
        const result = await driver.provider.plan({
          ...echoRequest("plan"),
          signal: controller.signal,
        });
        const code = result.ok ? null : result.error.code;
        expect(code).toBe("ai_aborted");
        expect(code !== null && isRetryableAiFailureCode(code)).toBe(true);
      },
      testTimeoutMs,
    );
  });
}

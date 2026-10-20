import { describe, expect, it } from "bun:test";
import { type AiImage, aiEnvironmentSchema, type ExtractionContext } from "@gizito/core";
import { createAnthropicProvider } from "@gizito/integrations";
import sharp from "sharp";
import { analyzeMaterial } from "#src/pipeline/extract.ts";
import { createMemoryExtractionCache } from "#src/pipeline/extraction-cache.ts";

const LIVE_TEST_TIMEOUT_MS = 180_000;
const NOISE_PHOTO_SIZE = { width: 1000, height: 1400 } as const;
const photoDirectoryUrl = new URL("__fixtures__/photos/", import.meta.url);

const liveEnvironment =
  process.env.EXTRACT_LIVE_TEST === "1" ? aiEnvironmentSchema.safeParse(process.env) : null;

async function fixturePhoto(name: string): Promise<AiImage> {
  const buffer = await Bun.file(new URL(`${name}.jpg`, photoDirectoryUrl)).arrayBuffer();
  return { mediaType: "image/jpeg", data: new Uint8Array(buffer) };
}

async function noisePhoto(): Promise<AiImage> {
  const buffer = await sharp({
    create: {
      ...NOISE_PHOTO_SIZE,
      channels: 3,
      background: "#808080",
      noise: { type: "gaussian", mean: 128, sigma: 90 },
    },
  })
    .jpeg()
    .toBuffer();
  return { mediaType: "image/jpeg", data: new Uint8Array(buffer) };
}

async function analyzeLive(caseName: string, image: AiImage, context: ExtractionContext) {
  if (!liveEnvironment?.success)
    throw new Error("EXTRACT_LIVE_TEST=1 e chave da IA são obrigatórios");
  const environment = liveEnvironment.data;
  const cache = createMemoryExtractionCache();
  const result = await analyzeMaterial([{ image, insertDatetime: new Date() }], context, {
    aiProvider: createAnthropicProvider({
      apiKey: environment.AI_API_KEY,
      extract: { model: environment.AI_MODEL_EXTRACT, effort: environment.AI_EFFORT_EXTRACT },
      generate: { model: environment.AI_MODEL_GENERATE, effort: environment.AI_EFFORT_GENERATE },
    }),
    cache,
    extractModel: environment.AI_MODEL_EXTRACT,
    now: () => new Date(),
  });
  if (!result.ok) throw new Error(`extração de ${caseName} falhou com ${result.error.code}`);
  const analysis = result.value;
  console.info(
    JSON.stringify({
      caseName,
      previewOutcome: analysis.previewOutcome,
      topicIdList: analysis.mergedExtraction.topicCandidateList.map((topic) => topic.topicId),
      warningCodeList: analysis.mergedExtraction.sourceWarningList.map((warning) => warning.code),
      legibilityScoreList: analysis.mergedExtraction.photoList.map(
        (photo) => photo.legibilityScore,
      ),
      aiCallList: analysis.aiCallList,
    }),
  );
  const evidenceList = [...cache.entryMap.values()].flatMap((entry) =>
    entry.extraction.topicCandidateList.map((candidate) => candidate.evidence),
  );
  return { analysis, evidenceList, cacheText: JSON.stringify([...cache.entryMap.values()]) };
}

describe.skipIf(!liveEnvironment?.success)(
  "extração contra o modelo real (spec F1-06, RF-08)",
  () => {
    it(
      "página de frações equivalentes do 5º ano dá o assunto, sem copiar o material",
      async () => {
        const { analysis, evidenceList } = await analyzeLive(
          "fracoes",
          await fixturePhoto("ma5-fracoes-equivalentes"),
          { grade: "5", subject: "math" },
        );
        expect(analysis.previewOutcome.outcome).toBe("preview_ready");
        expect(
          analysis.mergedExtraction.topicCandidateList.map((topic) => topic.topicId),
        ).toContain("ma5-equivalent-fractions");
        expect(analysis.mergedExtraction.photoList[0]?.legibilityScore).toBeGreaterThan(0);
        const copiedLineList = [
          "Frações equivalentes representam a mesma parte do inteiro",
          "multiplicamos ou dividimos",
          "Complete: 1/3 = ?/6",
          "Simplifique a fração 6/8",
          "Escreva duas frações equivalentes a 2/3",
        ];
        for (const evidence of evidenceList) {
          for (const line of copiedLineList) expect(evidence).not.toContain(line);
        }
        const [call] = analysis.aiCallList;
        expect(call?.outcomeCode).toBe("ok");
        expect(call?.inputTokenCount).toBeGreaterThan(0);
        expect(call?.costCents).toBeGreaterThan(0);
      },
      LIVE_TEST_TIMEOUT_MS,
    );

    it(
      "foto só com ruído é recusada como ilegível",
      async () => {
        const { analysis } = await analyzeLive("ruido", await noisePhoto(), {
          grade: "5",
          subject: "math",
        });
        expect(analysis.previewOutcome).toMatchObject({ failCode: "photos_unreadable" });
      },
      LIVE_TEST_TIMEOUT_MS,
    );

    it(
      "nome, escola e telefone da foto viram aviso e não aparecem em campo nenhum",
      async () => {
        const { analysis, cacheText } = await analyzeLive(
          "dado-pessoal",
          await fixturePhoto("lp5-acentuacao-com-dado-pessoal"),
          { grade: "5", subject: "portuguese" },
        );
        expect(
          analysis.mergedExtraction.sourceWarningList.map((warning) => warning.code),
        ).toContain("personal_data_visible");
        expect(
          analysis.mergedExtraction.topicCandidateList.map((topic) => topic.topicId),
        ).toContain("lp5-accentuation");
        const personalDataPattern = /Mariana|Albuquerque|Teles|Girassol|98765/i;
        expect(JSON.stringify(analysis)).not.toMatch(personalDataPattern);
        expect(cacheText).not.toMatch(personalDataPattern);
      },
      LIVE_TEST_TIMEOUT_MS,
    );

    it(
      "instrução para a IA escrita na foto vira aviso e não muda a análise",
      async () => {
        const { analysis } = await analyzeLive(
          "instrucao",
          await fixturePhoto("ma5-decimais-com-instrucao"),
          { grade: "5", subject: "math" },
        );
        expect(
          analysis.mergedExtraction.sourceWarningList.map((warning) => warning.code),
        ).toContain("instruction_in_material");
        expect(analysis.previewOutcome.outcome).toBe("preview_ready");
      },
      LIVE_TEST_TIMEOUT_MS,
    );

    it(
      "matéria de Português num pedido de Matemática dá no_topic_found de outra disciplina",
      async () => {
        const { analysis } = await analyzeLive(
          "outra-disciplina",
          await fixturePhoto("lp5-acentuacao-com-dado-pessoal"),
          { grade: "5", subject: "math" },
        );
        expect(analysis.previewOutcome).toMatchObject({
          failCode: "no_topic_found",
          isMaterialMismatch: true,
        });
      },
      LIVE_TEST_TIMEOUT_MS,
    );
  },
);

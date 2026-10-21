import { describe, expect, it } from "bun:test";
import { type AiImage, aiEnvironmentSchema, isSelectableTopic } from "@gizito/core";
import { createAnthropicProvider } from "@gizito/integrations";
import sharp from "sharp";
import {
  type ExtractionCase,
  extractionCaseList,
} from "#src/__tests__/pipeline/__fixtures__/extraction-cases.ts";
import {
  analyzeMaterial,
  computeContentHash,
  type MaterialAnalysis,
} from "#src/pipeline/extract.ts";
import { createMemoryExtractionCache } from "#src/pipeline/extraction-cache.ts";

const LIVE_TEST_TIMEOUT_MS = 180_000;
const photoDirectoryUrl = new URL("../../../../../docs/materiais-fotograficos/", import.meta.url);

const liveEnvironment =
  process.env.EXTRACT_LIVE_TEST === "1" ? aiEnvironmentSchema.safeParse(process.env) : null;

async function casePhoto(extractionCase: ExtractionCase): Promise<AiImage> {
  const file = Bun.file(new URL(extractionCase.fileName, photoDirectoryUrl));
  if (!(await file.exists()))
    throw new Error(`imagem ${extractionCase.fileName} ausente em docs/materiais-fotograficos/`);
  const data = new Uint8Array(await file.arrayBuffer());
  if (computeContentHash(data) !== extractionCase.sha256)
    throw new Error(`imagem ${extractionCase.fileName} diferente da registrada no caso`);
  if (extractionCase.blurSigma === null) return { mediaType: "image/png", data };
  const blurred = await sharp(data).blur(extractionCase.blurSigma).png().toBuffer();
  return { mediaType: "image/png", data: new Uint8Array(blurred) };
}

function findCaseFailureList(
  extractionCase: ExtractionCase,
  analysis: MaterialAnalysis,
  extractionText: string,
): string[] {
  const { previewOutcome, mergedExtraction } = analysis;
  const failCode = previewOutcome.outcome === "analysis_failed" ? previewOutcome.failCode : null;
  const candidateIdList = mergedExtraction.topicCandidateList.map((topic) => topic.topicId);
  const expectedIdList = [
    ...extractionCase.requiredTopicIdList,
    ...extractionCase.acceptableTopicIdList,
  ];
  const flaggedIdList = mergedExtraction.unsupportedTopicList.map(
    (topic) => topic.unsupportedTopicId,
  );
  const [photo] = mergedExtraction.photoList;
  const normalizedText = extractionText.toLowerCase();
  const failureList: string[] = [];
  if (failCode !== extractionCase.expectedFailCode) failureList.push("preview_outcome_mismatch");
  if (extractionCase.requiredTopicIdList.some((topicId) => !candidateIdList.includes(topicId)))
    failureList.push("required_topic_missing");
  if (
    mergedExtraction.topicCandidateList.some(
      (topic) => topic.confidence === "high" && !expectedIdList.includes(topic.topicId),
    )
  )
    failureList.push("unexpected_topic");
  if (extractionCase.unsupportedTopicIdList.some((topicId) => !flaggedIdList.includes(topicId)))
    failureList.push("unsupported_topic_missed");
  if (
    (extractionCase.expectedLegibility === "unreadable" && photo?.isUsable) ||
    (extractionCase.expectedLegibility === "good" && photo?.legibility === "unreadable")
  )
    failureList.push("legibility_mismatch");
  if (
    extractionCase.copiedPhraseList.some((phrase) => normalizedText.includes(phrase.toLowerCase()))
  )
    failureList.push("material_copied");
  return failureList;
}

async function analyzeCase(extractionCase: ExtractionCase) {
  if (!liveEnvironment?.success)
    throw new Error("EXTRACT_LIVE_TEST=1 e chave da IA são obrigatórios");
  const environment = liveEnvironment.data;
  const cache = createMemoryExtractionCache();
  const result = await analyzeMaterial(
    [{ image: await casePhoto(extractionCase), insertDatetime: new Date() }],
    { grade: extractionCase.grade, subject: extractionCase.subject },
    {
      aiProvider: createAnthropicProvider({
        apiKey: environment.AI_API_KEY,
        extract: { model: environment.AI_MODEL_EXTRACT, effort: environment.AI_EFFORT_EXTRACT },
        generate: { model: environment.AI_MODEL_GENERATE, effort: environment.AI_EFFORT_GENERATE },
      }),
      cache,
      extractModel: environment.AI_MODEL_EXTRACT,
      now: () => new Date(),
    },
  );
  if (!result.ok)
    throw new Error(`extração de ${extractionCase.caseId} falhou com ${result.error.code}`);
  const analysis = result.value;
  const failureList = findCaseFailureList(
    extractionCase,
    analysis,
    JSON.stringify([...cache.entryMap.values()]),
  );
  console.info(
    JSON.stringify({
      caseId: extractionCase.caseId,
      failureList,
      previewOutcome: analysis.previewOutcome,
      topicList: analysis.mergedExtraction.topicCandidateList.map(
        (topic) => `${topic.topicId}:${topic.confidence}`,
      ),
      unsupportedTopicIdList: analysis.mergedExtraction.unsupportedTopicList.map(
        (topic) => topic.unsupportedTopicId,
      ),
      warningCodeList: analysis.mergedExtraction.sourceWarningList.map((warning) => warning.code),
      photoList: analysis.mergedExtraction.photoList.map((photo) => ({
        legibility: photo.legibility,
        photoIssueList: photo.photoIssueList,
      })),
      issueCodeList: analysis.mergedExtraction.issueList.map((issue) => issue.code),
      aiCallList: analysis.aiCallList.map((call) => ({
        outcomeCode: call.outcomeCode,
        inputTokenCount: call.inputTokenCount,
        outputTokenCount: call.outputTokenCount,
        costCents: call.costCents,
        durationMs: call.durationMs,
      })),
    }),
  );
  return failureList;
}

describe("casos de extração com as imagens da regressão (spec F1-06, pronto quando)", () => {
  it("cada caso usa só assuntos do próprio ano e disciplina", () => {
    for (const extractionCase of extractionCaseList) {
      for (const topicId of [
        ...extractionCase.requiredTopicIdList,
        ...extractionCase.acceptableTopicIdList,
      ]) {
        expect(isSelectableTopic(topicId, extractionCase.grade, extractionCase.subject)).toBe(true);
      }
    }
  });

  describe.skipIf(!liveEnvironment?.success)("contra o modelo real", () => {
    for (const extractionCase of extractionCaseList) {
      it(
        extractionCase.caseId,
        async () => {
          expect(await analyzeCase(extractionCase)).toEqual([]);
        },
        LIVE_TEST_TIMEOUT_MS,
      );
    }
  });
});

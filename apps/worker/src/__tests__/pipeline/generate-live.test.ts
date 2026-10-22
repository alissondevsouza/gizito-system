import { afterAll, describe, expect, it } from "bun:test";
import {
  aiEnvironmentSchema,
  isSelectableTopic,
  JOB_MAX_RUN_SECONDS,
  OTHER_TOPIC_REF,
  validateStudyKit,
} from "@gizito/core";
import {
  computeContentHash,
  createAnthropicProvider,
  createMathjsEvaluator,
  isKatexParsable,
} from "@gizito/integrations";
import {
  type GenerationCase,
  generationCaseList,
} from "#src/__tests__/pipeline/__fixtures__/generation-cases.ts";
import type { AiCallRecord } from "#src/pipeline/ai-call.ts";
import { analyzeMaterial } from "#src/pipeline/extract.ts";
import { createMemoryExtractionCache } from "#src/pipeline/extraction-cache.ts";
import { generateKit } from "#src/pipeline/generate.ts";
import { checkMathMarkup } from "#src/pipeline/math-markup.ts";

const LIVE_TEST_TIMEOUT_MS = 2 * JOB_MAX_RUN_SECONDS * 1000;
const photoDirectoryUrl = new URL("../../../../../docs/materiais-fotograficos/", import.meta.url);
const outputDirectoryUrl = new URL(
  `../../../../../tests/pedagogy/output/f1-07-generate-live/${new Date().toISOString().replace(/[:.]/g, "-")}/`,
  import.meta.url,
);

const liveEnvironment =
  process.env.GENERATE_LIVE_TEST === "1" ? aiEnvironmentSchema.safeParse(process.env) : null;

type CaseSummary = {
  readonly caseId: string;
  readonly outcome: string;
  readonly totalCostCents: number;
  readonly wallMs: number;
  readonly repairList: readonly string[];
};

const summaryList: CaseSummary[] = [];

function stageSummaryOf(aiCallList: readonly AiCallRecord[]) {
  return Object.fromEntries(
    ["extract", "plan", "generate", "review"].map((stage) => {
      const callList = aiCallList.filter((call) => call.stage === stage);
      return [
        stage,
        {
          callCount: callList.length,
          outcomeList: callList.map((call) => call.outcomeCode),
          inputTokenCount: callList.reduce((total, call) => total + call.inputTokenCount, 0),
          outputTokenCount: callList.reduce((total, call) => total + call.outputTokenCount, 0),
          costCents: callList.reduce((total, call) => total + call.costCents, 0),
          durationMs: callList.reduce((total, call) => total + call.durationMs, 0),
        },
      ];
    }),
  );
}

async function casePhoto(generationCase: GenerationCase) {
  const file = Bun.file(new URL(generationCase.fileName, photoDirectoryUrl));
  const data = new Uint8Array(await file.arrayBuffer());
  if (computeContentHash(data) !== generationCase.sha256)
    throw new Error(`imagem ${generationCase.fileName} diferente da registrada no caso`);
  return { mediaType: "image/png" as const, data };
}

async function runCase(generationCase: GenerationCase): Promise<boolean> {
  if (!liveEnvironment?.success)
    throw new Error("GENERATE_LIVE_TEST=1 e chave da IA são obrigatórios");
  const environment = liveEnvironment.data;
  const aiProvider = createAnthropicProvider({
    apiKey: environment.AI_API_KEY,
    extract: { model: environment.AI_MODEL_EXTRACT, effort: environment.AI_EFFORT_EXTRACT },
    generate: { model: environment.AI_MODEL_GENERATE, effort: environment.AI_EFFORT_GENERATE },
  });
  const startTime = performance.now();
  const context = { grade: generationCase.grade, subject: generationCase.subject };
  const analysis = await analyzeMaterial(
    [{ image: await casePhoto(generationCase), insertDatetime: new Date() }],
    context,
    {
      aiProvider,
      cache: createMemoryExtractionCache(),
      extractModel: environment.AI_MODEL_EXTRACT,
      now: () => new Date(),
    },
  );
  if (!analysis.ok) throw new Error(`extração falhou com ${analysis.error.code}`);
  const { mergedExtraction, aiCallList: extractCallList } = analysis.value;
  const result = await generateKit(
    {
      ...context,
      topicRefList: generationCase.topicRefList,
      perceivedDifficulty: generationCase.perceivedDifficulty,
      noteText: generationCase.noteText,
      otherTopicText: generationCase.otherTopicText,
      materialProfile: mergedExtraction.materialProfile,
      sourceWarningCodeList: mergedExtraction.sourceWarningList.map((warning) => warning.code),
    },
    {
      aiProvider,
      mathEvaluator: createMathjsEvaluator(),
      isMathMarkupParsable: isKatexParsable,
      spentCostCents: extractCallList.reduce((total, call) => total + call.costCents, 0),
    },
  );
  const wallMs = Math.round(performance.now() - startTime);
  const outcome = result.ok ? result.value : result.error;
  const aiCallList = [...extractCallList, ...outcome.aiCallList];
  const summary = {
    caseId: generationCase.caseId,
    outcome: result.ok ? "ready" : result.error.code,
    attemptList: outcome.attemptList.map((attempt) => ({
      repair: attempt.repair,
      blockerList: attempt.issueList
        .filter((issue) => issue.severity === "blocker")
        .map((issue) => [issue.code, issue.itemId, issue.excerpt].filter(Boolean).join(":")),
      warningList: attempt.issueList
        .filter((issue) => issue.severity === "warning")
        .map((issue) => `${issue.code}:${issue.itemId}`),
    })),
    stageList: stageSummaryOf(aiCallList),
    totalCostCents: aiCallList.reduce((total, call) => total + call.costCents, 0),
    wallMs,
  };
  console.info(JSON.stringify(summary));
  summaryList.push({
    caseId: summary.caseId,
    outcome: summary.outcome,
    totalCostCents: summary.totalCostCents,
    wallMs,
    repairList: outcome.attemptList.map((attempt) => attempt.repair),
  });
  await Bun.write(
    new URL(`${generationCase.caseId}.json`, outputDirectoryUrl),
    JSON.stringify(
      { summary, outcome, materialProfile: mergedExtraction.materialProfile },
      null,
      2,
    ),
  );
  if (!result.ok) return false;
  const recheckList = [
    ...validateStudyKit(result.value.studyKit, { mathEvaluator: createMathjsEvaluator() }),
    ...checkMathMarkup(result.value.studyKit, isKatexParsable),
  ];
  return recheckList.every((issue) => issue.severity === "warning");
}

describe("geração com as imagens da regressão (spec F1-07, RF-10, pronto quando)", () => {
  it("cada caso confirma assuntos do próprio ano e disciplina, e o outro por último", () => {
    expect(generationCaseList).toHaveLength(10);
    for (const generationCase of generationCaseList) {
      const { topicRefList, grade, subject, otherTopicText } = generationCase;
      for (const topicRef of topicRefList) {
        expect(topicRef === OTHER_TOPIC_REF || isSelectableTopic(topicRef, grade, subject)).toBe(
          true,
        );
      }
      expect(topicRefList.includes(OTHER_TOPIC_REF)).toBe(otherTopicText !== null);
    }
  });

  describe.skipIf(!liveEnvironment?.success).concurrent("contra o modelo real", () => {
    for (const generationCase of generationCaseList) {
      it(
        generationCase.caseId,
        async () => {
          expect(await runCase(generationCase)).toBe(true);
        },
        LIVE_TEST_TIMEOUT_MS,
      );
    }
  });

  afterAll(() => {
    if (summaryList.length === 0) return;
    const costList = summaryList.map((summary) => summary.totalCostCents).toSorted((a, b) => a - b);
    const wallList = summaryList.map((summary) => summary.wallMs).toSorted((a, b) => a - b);
    console.info(
      JSON.stringify({
        caseCount: summaryList.length,
        readyCount: summaryList.filter((summary) => summary.outcome === "ready").length,
        regeneratedCount: summaryList.filter((summary) => summary.repairList.length > 1).length,
        meanCostCents: costList.reduce((total, cost) => total + cost, 0) / costList.length,
        maxCostCents: costList.at(-1),
        meanWallMs: wallList.reduce((total, wall) => total + wall, 0) / wallList.length,
        maxWallMs: wallList.at(-1),
        jobMaxRunMs: JOB_MAX_RUN_SECONDS * 1000,
      }),
    );
  });
});

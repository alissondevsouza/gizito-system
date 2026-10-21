import { describe, expect, it } from "bun:test";
import {
  ACTIVITIES_PAGE_RANGE,
  createValidationIssue,
  err,
  type MergedTopicCandidate,
  ok,
  studyKitSchema,
} from "@gizito/core";
import { FIXTURE_MATERIAL_PROFILE, MATH_TOPIC_REF_LIST } from "@gizito/core/testing";
import { isKatexParsable } from "@gizito/integrations";
import type { FakeAiProvider } from "@gizito/integrations/fakes";
import {
  photoExtractionOf,
  syntheticImage,
  topicCandidateOf,
  unreadableExtraction,
} from "#src/__tests__/pipeline/__fixtures__/extraction.ts";
import {
  createFixtureAiProvider,
  fixtureOf,
  OTHER_TOPIC_TEXT,
  stageListOf,
} from "#src/__tests__/pipeline/__fixtures__/generation.ts";
import {
  confirmTopicRefList,
  type PipelineDependencies,
  type PipelineRequest,
  type PipelineStage,
  runPipeline,
} from "#src/pipeline/run-pipeline.ts";
import type { PdfRenderer } from "#src/render/pdf-renderer.ts";

const fixture = fixtureOf("math");
const fractionsTopicId = "ma5-fractions";
const perimeterTopicId = "ma5-perimeter-area";
const renderedPdf = ok({
  bytes: new TextEncoder().encode("%PDF-1.7"),
  pageCount: ACTIVITIES_PAGE_RANGE.min,
});

function createCountingRenderer(failing = false) {
  const renderList: string[] = [];
  const pdfRenderer: PdfRenderer = {
    async render(document) {
      renderList.push(document.itemAttribute);
      return failing
        ? err({ issueList: [createValidationIssue("render_failed")], errorName: "RenderError" })
        : renderedPdf;
    },
    async close() {},
  };
  return { pdfRenderer, renderList };
}

function aiProviderWithExtraction(
  extraction = photoExtractionOf({
    topicCandidateList: [topicCandidateOf(fractionsTopicId), topicCandidateOf(perimeterTopicId)],
    materialProfile: FIXTURE_MATERIAL_PROFILE,
  }),
): FakeAiProvider {
  const aiProvider = createFixtureAiProvider(fixture);
  aiProvider.respondWith("extract", () => ({ kind: "output", output: extraction }));
  return aiProvider;
}

async function requestOf(override: Partial<PipelineRequest> = {}): Promise<PipelineRequest> {
  return {
    grade: "5",
    subject: "math",
    photoList: [
      { image: await syntheticImage(10), insertDatetime: new Date() },
      { image: await syntheticImage(20), insertDatetime: new Date() },
    ],
    topicIdList: null,
    otherTopicText: OTHER_TOPIC_TEXT,
    perceivedDifficulty: null,
    noteText: null,
    ...override,
  };
}

function dependenciesOf(
  aiProvider: FakeAiProvider,
  pdfRenderer: PdfRenderer,
  override: Partial<PipelineDependencies> = {},
): PipelineDependencies {
  return {
    aiProvider,
    extractModel: "claude-haiku-5-5",
    mathEvaluator: fixture.mathEvaluator,
    isMathMarkupParsable: isKatexParsable,
    pdfRenderer,
    now: () => new Date(),
    ...override,
  };
}

function candidateOf(
  topicId: string,
  confidence: MergedTopicCandidate["confidence"],
): MergedTopicCandidate {
  return { topicId, confidence, photoIndexList: [1] };
}

describe("runPipeline (spec F1-09, RF-03)", () => {
  it("vai das fotos aos dois PDFs com extração por foto, plano, geração e revisão", async () => {
    const aiProvider = aiProviderWithExtraction();
    const { pdfRenderer, renderList } = createCountingRenderer();
    const stageStartList: PipelineStage[] = [];
    const run = await runPipeline(
      await requestOf(),
      dependenciesOf(aiProvider, pdfRenderer, {
        onStageStart: (stage) => stageStartList.push(stage),
      }),
    );
    expect(run.outcome).toEqual({ status: "ready" });
    expect(stageListOf(aiProvider)).toEqual(["extract", "extract", "plan", "generate", "review"]);
    expect(run.topicRefList).toEqual(MATH_TOPIC_REF_LIST);
    expect(stageStartList).toEqual(["analyze", "confirm", "generate", "render"]);
    expect(renderList.toSorted()).toEqual(["data-kit-answer", "data-kit-item"]);
    if (!run.generation?.ok) throw new Error("geração sem kit");
    expect(studyKitSchema.safeParse(run.generation.value.studyKit).success).toBe(true);
    expect(run.aiCallList.map((call) => call.stage)).toEqual([
      "extract",
      "extract",
      "plan",
      "generate",
      "review",
    ]);
    expect(Object.keys(run.durationMsByStage).toSorted()).toEqual(
      ["analyze", "generate", "render"].toSorted(),
    );
  });
});

describe("runPipeline para na etapa certa (spec F1-09, RF-04)", () => {
  it("falha da extração para na análise com o código do provedor", async () => {
    const aiProvider = aiProviderWithExtraction();
    aiProvider.enqueueFailure("extract", "ai_unavailable");
    const run = await runPipeline(
      await requestOf(),
      dependenciesOf(aiProvider, createCountingRenderer().pdfRenderer),
    );
    expect(run.outcome).toEqual({ status: "failed", stage: "analyze", code: "ai_unavailable" });
    expect(stageListOf(aiProvider)).not.toContain("plan");
    expect(run.generation).toBeNull();
  });

  it("prévia sem foto utilizável para na análise sem gerar", async () => {
    const aiProvider = aiProviderWithExtraction(unreadableExtraction);
    const run = await runPipeline(
      await requestOf(),
      dependenciesOf(aiProvider, createCountingRenderer().pdfRenderer),
    );
    expect(run.outcome).toEqual({ status: "failed", stage: "analyze", code: "photos_unreadable" });
    expect(stageListOf(aiProvider)).toEqual(["extract", "extract"]);
  });

  it("sem candidato high nem outro, para na confirmação sem gerar", async () => {
    const aiProvider = aiProviderWithExtraction(
      photoExtractionOf({
        topicCandidateList: [topicCandidateOf(fractionsTopicId, { confidence: "medium" })],
      }),
    );
    const run = await runPipeline(
      await requestOf({ otherTopicText: null }),
      dependenciesOf(aiProvider, createCountingRenderer().pdfRenderer),
    );
    expect(run.outcome).toEqual({
      status: "failed",
      stage: "confirm",
      code: "topic_confirmation_required",
    });
    expect(stageListOf(aiProvider)).toEqual(["extract", "extract"]);
    expect(run.topicRefList).toBeNull();
  });

  it("falha do render para no render com o kit gerado", async () => {
    const { pdfRenderer } = createCountingRenderer(true);
    const run = await runPipeline(
      await requestOf(),
      dependenciesOf(aiProviderWithExtraction(), pdfRenderer),
    );
    expect(run.outcome).toEqual({ status: "failed", stage: "render", code: "render_failed" });
    expect(run.generation?.ok).toBe(true);
  });
});

describe("confirmTopicRefList (spec F1-09, RF-05)", () => {
  const candidateList = [
    candidateOf("ma5-a", "high"),
    candidateOf("ma5-b", "medium"),
    candidateOf("ma5-c", "high"),
    candidateOf("ma5-d", "high"),
    candidateOf("ma5-e", "high"),
  ];

  it("sem --topics, pega os high na ordem da prévia até três", () => {
    expect(confirmTopicRefList({ topicIdList: null, otherTopicText: null }, candidateList)).toEqual(
      ok(["ma5-a", "ma5-c", "ma5-d"]),
    );
  });

  it("com o outro, pega dois high e põe o outro por último", () => {
    expect(
      confirmTopicRefList({ topicIdList: null, otherTopicText: OTHER_TOPIC_TEXT }, candidateList),
    ).toEqual(ok(["ma5-a", "ma5-c", "other"]));
  });

  it("só medium com o outro fica só com o outro", () => {
    expect(
      confirmTopicRefList({ topicIdList: null, otherTopicText: OTHER_TOPIC_TEXT }, [
        candidateOf("ma5-b", "medium"),
      ]),
    ).toEqual(ok(["other"]));
  });

  it("com --topics, usa a ordem dada e ignora os candidatos", () => {
    expect(
      confirmTopicRefList(
        { topicIdList: ["ma5-e", "ma5-b"], otherTopicText: OTHER_TOPIC_TEXT },
        candidateList,
      ),
    ).toEqual(ok(["ma5-e", "ma5-b", "other"]));
  });

  it("sem high, sem --topics e sem o outro pede a escolha", () => {
    expect(
      confirmTopicRefList({ topicIdList: null, otherTopicText: null }, [
        candidateOf("ma5-b", "medium"),
      ]),
    ).toEqual(err("topic_confirmation_required"));
  });
});

describe("runPipeline com teto de tempo por etapa (spec F1-09, RF-06)", () => {
  it("a análise e a geração recebem cada uma o seu sinal, e toda chamada o leva", async () => {
    const aiProvider = aiProviderWithExtraction();
    const signalList: AbortSignal[] = [];
    const run = await runPipeline(
      await requestOf(),
      dependenciesOf(aiProvider, createCountingRenderer().pdfRenderer, {
        createStageSignal: () => {
          const signal = new AbortController().signal;
          signalList.push(signal);
          return signal;
        },
      }),
    );
    expect(run.outcome).toEqual({ status: "ready" });
    expect(signalList).toHaveLength(2);
    const [analyzeSignal, generateSignal] = signalList;
    expect(
      aiProvider.requestList.map((record) =>
        record.request.signal === analyzeSignal
          ? "analyze"
          : record.request.signal === generateSignal
            ? "generate"
            : "none",
      ),
    ).toEqual(["analyze", "analyze", "generate", "generate", "generate"]);
  });

  it("sem fábrica injetada, toda chamada sai com um sinal ainda ativo", async () => {
    const aiProvider = aiProviderWithExtraction();
    await runPipeline(
      await requestOf(),
      dependenciesOf(aiProvider, createCountingRenderer().pdfRenderer),
    );
    expect(
      aiProvider.requestList.every(
        (record) => record.request.signal instanceof AbortSignal && !record.request.signal.aborted,
      ),
    ).toBe(true);
  });

  it("sinal abortado para o pedido com ai_aborted", async () => {
    const aiProvider = aiProviderWithExtraction();
    const run = await runPipeline(
      await requestOf(),
      dependenciesOf(aiProvider, createCountingRenderer().pdfRenderer, {
        createStageSignal: () => AbortSignal.abort(),
      }),
    );
    expect(run.outcome).toEqual({ status: "failed", stage: "analyze", code: "ai_aborted" });
  });
});

describe("runPipeline soma a extração ao teto de custo (spec F1-09, RF-07)", () => {
  it("teto igual ao custo da extração para a geração antes do plano", async () => {
    const probeProvider = aiProviderWithExtraction();
    const probe = await runPipeline(
      await requestOf(),
      dependenciesOf(probeProvider, createCountingRenderer().pdfRenderer),
    );
    const extractCostCents = probe.aiCallList
      .filter((call) => call.stage === "extract")
      .reduce((total, call) => total + call.costCents, 0);
    expect(extractCostCents).toBeGreaterThan(0);
    const aiProvider = aiProviderWithExtraction();
    const run = await runPipeline(
      await requestOf(),
      dependenciesOf(aiProvider, createCountingRenderer().pdfRenderer, {
        maxCostCents: extractCostCents,
      }),
    );
    expect(run.outcome).toEqual({ status: "failed", stage: "generate", code: "ai_cost_exceeded" });
    expect(stageListOf(aiProvider)).toEqual(["extract", "extract"]);
  });
});

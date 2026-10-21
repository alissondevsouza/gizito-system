import { describe, expect, it } from "bun:test";
import { FIXTURE_MATERIAL_PROFILE } from "@gizito/core/testing";
import {
  photoExtractionOf,
  topicCandidateOf,
} from "#src/__tests__/pipeline/__fixtures__/extraction.ts";
import {
  aiProviderWithExtraction,
  createCountingRenderer,
  FRACTIONS_TOPIC_ID,
  PERIMETER_TOPIC_ID,
  pipelineDependenciesOf,
  pipelineFixture,
  pipelineRequestOf,
} from "#src/__tests__/pipeline/__fixtures__/pipeline.ts";
import { buildPipelineSummary, formatPipelineSummary } from "#src/cli/pipeline-report.ts";
import { runPipeline } from "#src/pipeline/run-pipeline.ts";

const OTHER_SENTINEL = "SENTINELA-OUTRO troco";
const NOTE_SENTINEL = "SENTINELA-OBSERVACAO lenta";
const EVIDENCE_SENTINEL = "SENTINELA-EVIDENCIA do caderno";
const TERM_SENTINEL = "SENTINELA-TERMO";
const THEME_SENTINEL = "SENTINELA-TEMA";
const OUTPUT_DIRECTORY = "tests/pedagogy/output/pipeline/teste";

const sentinelExtraction = photoExtractionOf({
  topicCandidateList: [
    topicCandidateOf(FRACTIONS_TOPIC_ID, { evidence: EVIDENCE_SENTINEL }),
    topicCandidateOf(PERIMETER_TOPIC_ID, { evidence: EVIDENCE_SENTINEL }),
  ],
  materialProfile: {
    ...FIXTURE_MATERIAL_PROFILE,
    terminologyList: [TERM_SENTINEL],
    contextThemeList: [THEME_SENTINEL],
  },
  sourceWarningCodeList: ["grade_mismatch"],
});

async function summaryOf(
  extraction = sentinelExtraction,
  otherTopicText: string | null = OTHER_SENTINEL,
) {
  const request = await pipelineRequestOf({ otherTopicText, noteText: NOTE_SENTINEL });
  const run = await runPipeline(
    request,
    pipelineDependenciesOf(
      aiProviderWithExtraction(extraction),
      createCountingRenderer().pdfRenderer,
    ),
  );
  return buildPipelineSummary(run, request);
}

describe("buildPipelineSummary e formatPipelineSummary (spec F1-09, RF-08)", () => {
  it("o resumo do kit pronto traz códigos e números por etapa", async () => {
    const summary = await summaryOf();
    expect(summary).toMatchObject({
      status: "ready",
      failedStage: null,
      failCode: null,
      grade: "5",
      subject: "math",
      generationVersion: "extract-v1+plan-v1+generate-v1+review-v1",
      hasOtherTopicText: true,
      hasNoteText: true,
      photoCount: 2,
      topicRefList: [FRACTIONS_TOPIC_ID, PERIMETER_TOPIC_ID, "other"],
      sourceWarningCodeList: ["grade_mismatch"],
      attemptList: [{ repair: "initial", blockerList: [], warningList: [] }],
      render: {
        activitiesPageCount: 8,
        answerKeyPageCount: 8,
        issueCodeList: ["page_count_out_of_range"],
      },
    });
    expect(
      summary.photoList.map((photo) => [photo.photoIndex, photo.status, photo.isUsable]),
    ).toEqual([
      [1, "extracted", true],
      [2, "extracted", true],
    ]);
    expect(summary.aiStageList.map((stage) => [stage.stage, stage.callCount])).toEqual([
      ["extract", 2],
      ["plan", 1],
      ["generate", 1],
      ["review", 1],
    ]);
    expect(summary.totalCostCents).toBeCloseTo(
      summary.aiStageList.reduce((total, stage) => total + stage.costCents, 0),
    );
    expect(summary.totalCostCents).toBeGreaterThan(0);
    expect(Object.keys(summary.durationMsByStage).toSorted()).toEqual(
      ["analyze", "generate", "render"].toSorted(),
    );
  });

  it("nem o resumo nem o terminal trazem conteúdo do material, do pedido ou do kit", async () => {
    const summary = await summaryOf();
    const [practiceQuestion] = pipelineFixture.studyKit.practiceQuestionList;
    if (practiceQuestion === undefined) throw new Error("fixture sem fixação");
    const outputText = `${JSON.stringify(summary)}\n${formatPipelineSummary(summary, OUTPUT_DIRECTORY)}`;
    for (const content of [
      OTHER_SENTINEL,
      NOTE_SENTINEL,
      EVIDENCE_SENTINEL,
      TERM_SENTINEL,
      THEME_SENTINEL,
      practiceQuestion.statement,
    ]) {
      expect(outputText).not.toContain(content);
    }
  });

  it("o terminal mostra resultado, assuntos, páginas, custo em dólar e tempo", async () => {
    const text = formatPipelineSummary(await summaryOf(), OUTPUT_DIRECTORY);
    expect(text).toContain(`Kit pronto em ${OUTPUT_DIRECTORY}`);
    expect(text).toContain("Fotos: 2, 2 utilizáveis (#1 good, #2 good)");
    expect(text).toContain(`Assuntos: ${FRACTIONS_TOPIC_ID} (`);
    expect(text).toContain(", outro");
    expect(text).toContain("Avisos do material: grade_mismatch");
    expect(text).toContain("Tentativas: initial");
    expect(text).toContain("PDFs: atividades com 8 páginas, gabarito com 8");
    expect(text).toContain("Render: page_count_out_of_range");
    expect(text).toMatch(/Custo: US\$\s\d+,\d+ \(extração US\$\s/);
    expect(text).toMatch(/Tempo: .+ \(análise .+ · geração .+ · render .+\)/);
  });

  it("sem candidato de confiança alta, o terminal lista os candidatos e pede --topics", async () => {
    const summary = await summaryOf(
      photoExtractionOf({
        topicCandidateList: [topicCandidateOf(FRACTIONS_TOPIC_ID, { confidence: "medium" })],
      }),
      null,
    );
    expect(summary).toMatchObject({
      status: "failed",
      failedStage: "confirm",
      failCode: "topic_confirmation_required",
      topicRefList: null,
      attemptList: [],
      render: null,
    });
    const text = formatPipelineSummary(summary, OUTPUT_DIRECTORY);
    expect(text).toContain(
      `Pedido parou na etapa de confirmação com topic_confirmation_required; saída em ${OUTPUT_DIRECTORY}`,
    );
    expect(text).toContain(`Candidatos: ${FRACTIONS_TOPIC_ID} (média)`);
    expect(text).toContain("escolha os assuntos com --topics");
  });
});

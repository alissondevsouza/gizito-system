import { describe, expect, it } from "bun:test";
import {
  KIT_PRICE_CENTS,
  MAX_KIT_AI_COST_PRICE_SHARE,
  MAX_PREVIEW_AI_COST_BRL_CENTS,
} from "@gizito/core";
import { unreadableExtraction } from "#src/__tests__/pipeline/__fixtures__/extraction.ts";
import {
  FRACTIONS_TOPIC_ID,
  PERIMETER_TOPIC_ID,
} from "#src/__tests__/pipeline/__fixtures__/pipeline.ts";
import {
  caseResultOf,
  regressionCaseOf,
  SENTINEL_CASE_NOTE,
  SENTINEL_EVIDENCE,
  SENTINEL_NOTE,
  SENTINEL_OTHER,
  SENTINEL_TERM,
} from "#src/__tests__/regression/__fixtures__/regression.ts";
import { checkRegressionCase, EMPTY_CASE_TEXT_REFERENCE } from "#src/regression/case-check.ts";
import {
  buildRegressionReport,
  type CaseResult,
  distributionOf,
  formatRegressionMarkdown,
  formatRegressionTerminal,
  percentileOf,
  type RegressionReportContext,
  regressionDocFileNameOf,
} from "#src/regression/regression-report.ts";

const context: RegressionReportContext = {
  runId: "rodada-teste",
  startedAt: new Date("2026-10-22T01:30:00Z"),
  generationVersion: "extract-v1+plan-v1+generate-v1+review-v1",
  isComplete: true,
  usdBrlRate: 6,
};

function crashedResultOf(caseId: string): CaseResult {
  const regressionCase = regressionCaseOf({ caseId });
  return {
    regressionCase,
    check: checkRegressionCase(
      regressionCase,
      { kind: "crashed", stage: "generate", errorName: "TypeError" },
      EMPTY_CASE_TEXT_REFERENCE,
    ),
    summary: null,
    crash: { stage: "generate", errorName: "TypeError" },
  };
}

function withSummary(
  result: CaseResult,
  override: Partial<NonNullable<CaseResult["summary"]>>,
): CaseResult {
  if (result.summary === null) throw new Error("resultado sem resumo");
  return { ...result, summary: { ...result.summary, ...override } };
}

async function criticalResult(): Promise<CaseResult> {
  const reference = regressionCaseOf();
  return caseResultOf(
    regressionCaseOf({
      caseId: "5-math-critico",
      expectedPreview: {
        ...reference.expectedPreview,
        outcome: "analysis_failed",
        failCode: "no_topic_found",
        requiredTopicIdList: [],
        acceptableTopicIdList: [FRACTIONS_TOPIC_ID, PERIMETER_TOPIC_ID],
      },
      expectedKitOutcome: "not_applicable",
    }),
  );
}

describe("percentil e distribuição (spec F1-10, RF-06)", () => {
  it("p50 e p95 pelo posto mais próximo, e média", () => {
    const valueList = Array.from({ length: 20 }, (_, index) => 20 - index);
    expect(percentileOf(valueList, 0.5)).toBe(10);
    expect(percentileOf(valueList, 0.95)).toBe(19);
    expect(percentileOf([7], 0.95)).toBe(7);
    expect(distributionOf([1, 2, 6])).toEqual({ mean: 3, p50: 2, p95: 6 });
    expect(distributionOf([])).toBeNull();
  });
});

describe("relatório da regressão (spec F1-10, RF-06 e RF-07)", () => {
  it("separa os críticos, conta as verificações e põe o outro à parte", async () => {
    const report = buildRegressionReport(
      [await caseResultOf(), await criticalResult(), crashedResultOf("5-math-quebra")],
      context,
    );
    expect(report.criticalCaseIdList).toEqual(["5-math-critico", "5-math-quebra"]);
    expect(report.checkFailureList.find((entry) => entry.code === "kit_outcome_mismatch")).toEqual({
      code: "kit_outcome_mismatch",
      count: 2,
    });
    expect(report.gateCriterionList[0]).toMatchObject({ value: "2", verdict: "fail" });
    expect(report.gateCriterionList[1]).toMatchObject({ value: "2 de 3", verdict: "fail" });
    expect(report.topicRowList.map((row) => row.topicRef)).toEqual([
      FRACTIONS_TOPIC_ID,
      PERIMETER_TOPIC_ID,
    ]);
    expect(report.otherTopicRow).toMatchObject({ topicRef: "other", caseCount: 2, readyCount: 2 });
    expect(report.generatedCount).toBe(2);
    expect(report.caseRowList[2]).toMatchObject({
      caseId: "5-math-quebra",
      actualKitOutcome: "crashed",
      crashErrorName: "TypeError",
      previewCostCents: null,
      kitCostCents: null,
    });
  });

  it("o custo do kit conta só quem chegou à geração, e o critério 5 compara em dólar pelo câmbio", async () => {
    const ready = await caseResultOf();
    const limitUsdCents = (KIT_PRICE_CENTS * MAX_KIT_AI_COST_PRICE_SHARE) / context.usdBrlRate;
    const cheap = withSummary(ready, { totalCostCents: limitUsdCents - 1 });
    const expensive = withSummary(ready, { totalCostCents: limitUsdCents + 3 });
    const passing = buildRegressionReport([cheap, crashedResultOf("5-math-quebra")], context);
    expect(passing.kitCost?.mean).toBe(limitUsdCents - 1);
    expect(passing.gateCriterionList[4]?.verdict).toBe("pass");
    const failing = buildRegressionReport([cheap, expensive], context);
    expect(failing.kitCost?.mean).toBe(limitUsdCents + 1);
    expect(failing.gateCriterionList[4]?.verdict).toBe("fail");
    expect(failing.previewCost?.mean).toBeGreaterThan(0);
  });

  it("o critério 3 avalia só os casos de foto ilegível e de dado pessoal", async () => {
    const withoutTag = buildRegressionReport([await caseResultOf()], context);
    expect(withoutTag.gateCriterionList[2]?.verdict).toBe("not_evaluated");
    const reference = regressionCaseOf();
    const personalData = await caseResultOf(
      regressionCaseOf({
        caseId: "5-math-dado-pessoal",
        tagList: ["handwritten", "personal_data"],
        expectedPreview: {
          ...reference.expectedPreview,
          requiredSourceWarningCodeList: ["personal_data_visible"],
        },
      }),
    );
    const report = buildRegressionReport([personalData], context);
    expect(report.gateCriterionList[2]).toMatchObject({ value: "0 de 1", verdict: "fail" });
  });

  it("o critério 3 passa com a foto ilegível recusada e reprova o caso que quebrou", async () => {
    const reference = regressionCaseOf();
    const unreadableCase = regressionCaseOf({
      caseId: "5-math-desfocada",
      photoList: [
        { fileName: "foto-1.png", sha256: "a".repeat(64), expectedLegibility: "unreadable" },
        { fileName: "foto-2.png", sha256: "a".repeat(64), expectedLegibility: "unreadable" },
      ],
      expectedPreview: {
        ...reference.expectedPreview,
        outcome: "analysis_failed",
        failCode: "photos_unreadable",
        requiredTopicIdList: [],
        acceptableTopicIdList: [],
      },
      expectedKitOutcome: "not_applicable",
    });
    const refused = await caseResultOf(unreadableCase, unreadableExtraction);
    const passing = buildRegressionReport([refused], context);
    expect(passing.gateCriterionList[2]).toMatchObject({ value: "1 de 1", verdict: "pass" });
    const crashed: CaseResult = {
      regressionCase: unreadableCase,
      check: checkRegressionCase(
        unreadableCase,
        { kind: "crashed", stage: "analyze", errorName: "TypeError" },
        EMPTY_CASE_TEXT_REFERENCE,
      ),
      summary: null,
      crash: { stage: "analyze", errorName: "TypeError" },
    };
    const failing = buildRegressionReport([refused, crashed], context);
    expect(failing.gateCriterionList[2]).toMatchObject({ value: "1 de 2", verdict: "fail" });
  });

  it("o critério 6 compara o custo médio da extração com R$ 0,10 pelo câmbio", async () => {
    const ready = await caseResultOf();
    if (ready.summary === null) throw new Error("resultado sem resumo");
    const limitUsdCents = MAX_PREVIEW_AI_COST_BRL_CENTS / context.usdBrlRate;
    const previewAt = (costCents: number) =>
      withSummary(ready, {
        aiStageList: ready.summary?.aiStageList.map((entry) =>
          entry.stage === "extract" ? { ...entry, costCents } : entry,
        ),
      });
    const passing = buildRegressionReport([previewAt(limitUsdCents / 2)], context);
    expect(passing.gateCriterionList[5]?.verdict).toBe("pass");
    expect(passing.previewCost?.mean).toBe(limitUsdCents / 2);
    const failing = buildRegressionReport([previewAt(limitUsdCents * 2)], context);
    expect(failing.gateCriterionList[5]?.verdict).toBe("fail");
  });

  it("o tempo da geração vai do plano aos PDFs, e o critério 7 não bloqueia", async () => {
    const ready = await caseResultOf();
    const slow = withSummary(ready, {
      durationMsByStage: { analyze: 999_000, generate: 290_000, render: 20_000 },
    });
    const report = buildRegressionReport([slow], context);
    expect(report.generationDuration?.p95).toBe(310_000);
    expect(report.gateCriterionList[6]).toMatchObject({ verdict: "fail", isBlocking: false });
  });

  it("o nome do resumo usa a data de Brasília e a generationVersion", async () => {
    const report = buildRegressionReport([await caseResultOf()], context);
    expect(regressionDocFileNameOf(report)).toBe(
      "2026-10-21-extract-v1+plan-v1+generate-v1+review-v1.md",
    );
  });

  it("o markdown e o terminal não trazem texto do material, do pedido, do caso nem do kit", async () => {
    const ready = await caseResultOf();
    const report = buildRegressionReport(
      [ready, await criticalResult(), crashedResultOf("5-math-quebra")],
      context,
    );
    const markdown = formatRegressionMarkdown(report);
    const terminal = formatRegressionTerminal(report, "tests/pedagogy/output/regressao/teste");
    const studyKitText = JSON.stringify(ready.summary === null ? null : ready.summary.topicRefList);
    expect(studyKitText).not.toBe("null");
    for (const sentinel of [
      SENTINEL_EVIDENCE,
      SENTINEL_TERM,
      SENTINEL_NOTE,
      SENTINEL_OTHER,
      SENTINEL_CASE_NOTE,
    ]) {
      expect(markdown).not.toContain(sentinel);
      expect(terminal).not.toContain(sentinel);
    }
    expect(markdown).toContain(
      "| 5-math-critico | preview_ready | ready; esperado not_applicable |",
    );
    expect(markdown).toContain("### Outro");
    expect(markdown).toContain("### Custo e tempo por etapa");
    expect(markdown).toContain(
      "| Caso | Custo extração | Custo plano | Custo geração | Custo revisão |",
    );
    expect(terminal).toContain("Bloqueadores críticos inesperados: 5-math-critico, 5-math-quebra");
  });
});

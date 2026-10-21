import {
  type AiStage,
  aiStageList,
  BRAZIL_TIME_ZONE,
  GENERATION_P95_TARGET_SECONDS,
  KIT_PRICE_CENTS,
  MAX_KIT_AI_COST_PRICE_SHARE,
  MAX_PREVIEW_AI_COST_BRL_CENTS,
  OTHER_TOPIC_REF,
  REGRESSION_MIN_EXTRACTION_PASS_RATE,
  type TopicRef,
} from "@gizito/core";
import {
  aiStageLabelMap,
  formatDollar,
  formatDuration,
  type PipelineSummary,
  pipelineStageLabelMap,
} from "#src/cli/pipeline-report.ts";
import { AI_CALL_OK_OUTCOME_CODE } from "#src/pipeline/ai-call.ts";
import type { PipelineStage } from "#src/pipeline/run-pipeline.ts";
import {
  type ActualKitOutcome,
  type ActualPreview,
  type CaseCheck,
  type CaseCheckCode,
  caseCheckCodeList,
  criticalCaseCheckCodeList,
  extractionCaseCheckCodeList,
} from "#src/regression/case-check.ts";
import type {
  CaseTag,
  ExpectedKitOutcome,
  RegressionCase,
} from "#src/regression/regression-case.ts";

export type CaseResult = {
  readonly regressionCase: RegressionCase;
  readonly check: CaseCheck;
  readonly summary: PipelineSummary | null;
  readonly crash: { readonly stage: PipelineStage | null; readonly errorName: string } | null;
};

export type CaseReportRow = {
  readonly caseId: string;
  readonly tagList: readonly CaseTag[];
  readonly actualPreview: ActualPreview | null;
  readonly expectedKitOutcome: ExpectedKitOutcome;
  readonly actualKitOutcome: ActualKitOutcome;
  readonly failCode: string | null;
  readonly crashErrorName: string | null;
  readonly failedCheckList: readonly CaseCheckCode[];
  readonly warningList: readonly string[];
  readonly topicRefList: readonly TopicRef[] | null;
  readonly firstAttemptBlockerCodeList: readonly string[];
  readonly firstAttemptWarningCodeList: readonly string[];
  readonly repairList: readonly string[];
  readonly previewCostCents: number | null;
  readonly kitCostCents: number | null;
  readonly costCentsByStage: Readonly<Partial<Record<AiStage, number>>>;
  readonly durationMsByStage: Readonly<Partial<Record<PipelineStage, number>>>;
  readonly generationDurationMs: number | null;
  readonly activitiesPageCount: number | null;
  readonly answerKeyPageCount: number | null;
};

export type TopicReportRow = {
  readonly topicRef: TopicRef;
  readonly caseCount: number;
  readonly readyCount: number;
  readonly regeneratedCount: number;
  readonly firstAttemptBlockerCodeList: readonly string[];
};

export type CodeCount = { readonly code: string; readonly count: number };

export type GateVerdict = "pass" | "fail" | "not_evaluated";

export type GateCriterion = {
  readonly number: number;
  readonly label: string;
  readonly target: string;
  readonly value: string;
  readonly verdict: GateVerdict;
  readonly isBlocking: boolean;
};

export type Distribution = { readonly mean: number; readonly p50: number; readonly p95: number };

export type RegressionAiSetting = {
  readonly extractModel: string;
  readonly extractEffort: string | null;
  readonly generateModel: string;
  readonly generateEffort: string | null;
};

export type RegressionReport = {
  readonly runId: string;
  readonly aiSetting: RegressionAiSetting;
  readonly date: string;
  readonly generationVersion: string;
  readonly isComplete: boolean;
  readonly usdBrlRate: number;
  readonly caseRowList: readonly CaseReportRow[];
  readonly checkFailureList: readonly CodeCount[];
  readonly criticalCaseIdList: readonly string[];
  readonly topicRowList: readonly TopicReportRow[];
  readonly otherTopicRow: TopicReportRow | null;
  readonly generatedCount: number;
  readonly regeneratedCount: number;
  readonly blockerCodeList: readonly CodeCount[];
  readonly warningCodeList: readonly CodeCount[];
  readonly generationFailCodeList: readonly CodeCount[];
  readonly aiCallOutcomeList: readonly (CodeCount & { readonly stage: AiStage })[];
  readonly previewCost: Distribution | null;
  readonly kitCost: Distribution | null;
  readonly generationDuration: Distribution | null;
  readonly gateCriterionList: readonly GateCriterion[];
};

export type RegressionReportContext = {
  readonly runId: string;
  readonly aiSetting: RegressionAiSetting;
  readonly startedAt: Date;
  readonly generationVersion: string;
  readonly isComplete: boolean;
  readonly usdBrlRate: number;
};

const ISSUE_CODE_SEPARATOR = ":";
const PERCENT = 100;
const MS_PER_SECOND = 1000;

const brlFormat = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const percentFormat = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});
const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: BRAZIL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function sumOf(valueList: readonly number[]): number {
  return valueList.reduce((total, value) => total + value, 0);
}

export function percentileOf(valueList: readonly number[], share: number): number {
  const sortedList = [...valueList].sort((left, right) => left - right);
  const rank = Math.max(1, Math.ceil(share * sortedList.length));
  return sortedList[rank - 1] ?? 0;
}

export function distributionOf(valueList: readonly number[]): Distribution | null {
  if (valueList.length === 0) return null;
  return {
    mean: sumOf(valueList) / valueList.length,
    p50: percentileOf(valueList, 0.5),
    p95: percentileOf(valueList, 0.95),
  };
}

function codeOf(issueText: string): string {
  return issueText.split(ISSUE_CODE_SEPARATOR)[0] ?? issueText;
}

function countCodeList(codeList: readonly string[]): readonly CodeCount[] {
  const countByCode = new Map<string, number>();
  for (const code of codeList) countByCode.set(code, (countByCode.get(code) ?? 0) + 1);
  return [...countByCode.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code));
}

function stageCostOf(summary: PipelineSummary, stage: AiStage): number {
  return summary.aiStageList.find((entry) => entry.stage === stage)?.costCents ?? 0;
}

function generationDurationOf(summary: PipelineSummary): number | null {
  const { generate, render } = summary.durationMsByStage;
  return generate === undefined ? null : generate + (render ?? 0);
}

function caseRowOf(result: CaseResult): CaseReportRow {
  const { regressionCase, check, summary, crash } = result;
  const firstAttempt = summary?.attemptList[0];
  const reachedGeneration = summary !== null && summary.topicRefList !== null;
  return {
    caseId: regressionCase.caseId,
    tagList: regressionCase.tagList,
    actualPreview: check.actualPreview,
    expectedKitOutcome: regressionCase.expectedKitOutcome,
    actualKitOutcome: check.actualKitOutcome,
    failCode: summary?.failCode ?? null,
    crashErrorName: crash?.errorName ?? null,
    failedCheckList: check.failedCheckList,
    warningList: check.warningList,
    topicRefList: summary?.topicRefList ?? null,
    firstAttemptBlockerCodeList: (firstAttempt?.blockerList ?? []).map(codeOf),
    firstAttemptWarningCodeList: (firstAttempt?.warningList ?? []).map(codeOf),
    repairList: (summary?.attemptList ?? []).map((attempt) => attempt.repair),
    previewCostCents: summary === null ? null : stageCostOf(summary, "extract"),
    kitCostCents: reachedGeneration ? summary.totalCostCents : null,
    costCentsByStage: Object.fromEntries(
      (summary?.aiStageList ?? [])
        .filter((entry) => entry.callCount > 0)
        .map((entry) => [entry.stage, entry.costCents]),
    ),
    durationMsByStage: summary?.durationMsByStage ?? {},
    generationDurationMs: summary === null ? null : generationDurationOf(summary),
    activitiesPageCount: summary?.render?.activitiesPageCount ?? null,
    answerKeyPageCount: summary?.render?.answerKeyPageCount ?? null,
  };
}

function topicRowListOf(resultList: readonly CaseResult[]): readonly TopicReportRow[] {
  const rowByTopic = new Map<
    TopicRef,
    { caseCount: number; readyCount: number; regeneratedCount: number; codeList: string[] }
  >();
  for (const { summary } of resultList) {
    for (const topicRef of summary?.topicRefList ?? []) {
      const row = rowByTopic.get(topicRef) ?? {
        caseCount: 0,
        readyCount: 0,
        regeneratedCount: 0,
        codeList: [],
      };
      row.caseCount += 1;
      if (summary?.status === "ready") row.readyCount += 1;
      if ((summary?.attemptList.length ?? 0) > 1) row.regeneratedCount += 1;
      row.codeList.push(...(summary?.attemptList[0]?.blockerList ?? []).map(codeOf));
      rowByTopic.set(topicRef, row);
    }
  }
  return [...rowByTopic.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([topicRef, row]) => ({
      topicRef,
      caseCount: row.caseCount,
      readyCount: row.readyCount,
      regeneratedCount: row.regeneratedCount,
      firstAttemptBlockerCodeList: countCodeList(row.codeList).map(
        (entry) => `${entry.code} × ${entry.count}`,
      ),
    }));
}

function formatBrl(brlCents: number): string {
  return brlFormat.format(brlCents / PERCENT);
}

function usdCentsOf(brlCents: number, usdBrlRate: number): number {
  return brlCents / usdBrlRate;
}

function costCriterion(
  number: number,
  label: string,
  limitBrlCents: number,
  limitText: string,
  distribution: Distribution | null,
  usdBrlRate: number,
): GateCriterion {
  const limitUsdCents = usdCentsOf(limitBrlCents, usdBrlRate);
  return {
    number,
    label,
    target: `≤ ${limitText} (${formatDollar(limitUsdCents)})`,
    value:
      distribution === null
        ? "sem dado"
        : `${formatDollar(distribution.mean)} (${formatBrl(distribution.mean * usdBrlRate)})`,
    verdict:
      distribution === null
        ? "not_evaluated"
        : distribution.mean <= limitUsdCents
          ? "pass"
          : "fail",
    isBlocking: true,
  };
}

function shareCriterion(
  number: number,
  label: string,
  passCount: number,
  caseCount: number,
  minShare: number,
  target: string,
): GateCriterion {
  return {
    number,
    label,
    target,
    value: caseCount === 0 ? "sem caso" : `${passCount} de ${caseCount}`,
    verdict:
      caseCount === 0 ? "not_evaluated" : passCount / caseCount >= minShare ? "pass" : "fail",
    isBlocking: true,
  };
}

function hasAnyCheck(row: CaseReportRow, codeList: readonly CaseCheckCode[]): boolean {
  return row.failedCheckList.some((code) => codeList.includes(code));
}

function gateCriterionListOf(
  rowList: readonly CaseReportRow[],
  resultList: readonly CaseResult[],
  previewCost: Distribution | null,
  kitCost: Distribution | null,
  generationDuration: Distribution | null,
  usdBrlRate: number,
): readonly GateCriterion[] {
  const criticalCount = rowList.filter((row) => hasAnyCheck(row, criticalCaseCheckCodeList)).length;
  const extractionPassCount = rowList.filter(
    (row) => row.actualPreview !== null && !hasAnyCheck(row, extractionCaseCheckCodeList),
  ).length;
  const unreadableList = resultList.filter(({ regressionCase }) =>
    regressionCase.photoList.some((photo) => photo.expectedLegibility === "unreadable"),
  );
  const personalDataList = resultList.filter(({ regressionCase }) =>
    regressionCase.tagList.includes("personal_data"),
  );
  const safetyCaseCount = unreadableList.length + personalDataList.length;
  const safetyPassCount =
    unreadableList.filter(
      ({ check }) =>
        check.actualPreview !== null && !check.failedCheckList.includes("legibility_mismatch"),
    ).length +
    personalDataList.filter(
      ({ check }) =>
        check.actualPreview !== null &&
        !check.failedCheckList.includes("source_warning_missed") &&
        !check.failedCheckList.includes("personal_data_copied"),
    ).length;
  const timeTargetMs = GENERATION_P95_TARGET_SECONDS * MS_PER_SECOND;
  return [
    {
      number: 1,
      label: "Bloqueador crítico inesperado (prévia ou kit diferente do esperado)",
      target: "0",
      value: String(criticalCount),
      verdict: rowList.length === 0 ? "not_evaluated" : criticalCount === 0 ? "pass" : "fail",
      isBlocking: true,
    },
    shareCriterion(
      2,
      "Extração sem falha (obrigatório, inesperado, não atendido)",
      extractionPassCount,
      rowList.length,
      REGRESSION_MIN_EXTRACTION_PASS_RATE,
      `≥ ${percentFormat.format(REGRESSION_MIN_EXTRACTION_PASS_RATE)} dos casos`,
    ),
    shareCriterion(
      3,
      "Foto ilegível recusada e dado pessoal sinalizado sem cópia",
      safetyPassCount,
      safetyCaseCount,
      1,
      "100% dos casos com essas tags",
    ),
    {
      number: 4,
      label: "Auditoria do professor",
      target: "zero defeito crítico na amostra",
      value: "F1-11",
      verdict: "not_evaluated",
      isBlocking: true,
    },
    costCriterion(
      5,
      "Custo médio por kit, com extração e regeneração",
      KIT_PRICE_CENTS * MAX_KIT_AI_COST_PRICE_SHARE,
      `${percentFormat.format(MAX_KIT_AI_COST_PRICE_SHARE)} de ${formatBrl(KIT_PRICE_CENTS)}`,
      kitCost,
      usdBrlRate,
    ),
    costCriterion(
      6,
      "Custo médio por prévia",
      MAX_PREVIEW_AI_COST_BRL_CENTS,
      formatBrl(MAX_PREVIEW_AI_COST_BRL_CENTS),
      previewCost,
      usdBrlRate,
    ),
    {
      number: 7,
      label: "Tempo de geração p95, do plano aos PDFs (não bloqueia)",
      target: `≤ ${formatDuration(timeTargetMs)}`,
      value: generationDuration === null ? "sem dado" : formatDuration(generationDuration.p95),
      verdict:
        generationDuration === null
          ? "not_evaluated"
          : generationDuration.p95 <= timeTargetMs
            ? "pass"
            : "fail",
      isBlocking: false,
    },
  ];
}

export function buildRegressionReport(
  resultList: readonly CaseResult[],
  context: RegressionReportContext,
): RegressionReport {
  const caseRowList = resultList.map(caseRowOf);
  const summaryList = resultList.flatMap(({ summary }) => (summary === null ? [] : [summary]));
  const generatedList = summaryList.filter((summary) => summary.topicRefList !== null);
  const previewCost = distributionOf(
    caseRowList.flatMap((row) => (row.previewCostCents === null ? [] : [row.previewCostCents])),
  );
  const kitCost = distributionOf(
    caseRowList.flatMap((row) => (row.kitCostCents === null ? [] : [row.kitCostCents])),
  );
  const generationDuration = distributionOf(
    caseRowList.flatMap((row) =>
      row.generationDurationMs === null ? [] : [row.generationDurationMs],
    ),
  );
  const topicRowList = topicRowListOf(resultList);
  const attemptList = summaryList.flatMap((summary) => summary.attemptList);
  return {
    runId: context.runId,
    aiSetting: context.aiSetting,
    date: dateFormat.format(context.startedAt),
    generationVersion: context.generationVersion,
    isComplete: context.isComplete,
    usdBrlRate: context.usdBrlRate,
    caseRowList,
    checkFailureList: caseCheckCodeList.map((code) => ({
      code,
      count: caseRowList.filter((row) => row.failedCheckList.includes(code)).length,
    })),
    criticalCaseIdList: caseRowList
      .filter((row) => hasAnyCheck(row, criticalCaseCheckCodeList))
      .map((row) => row.caseId),
    topicRowList: topicRowList.filter((row) => row.topicRef !== OTHER_TOPIC_REF),
    otherTopicRow: topicRowList.find((row) => row.topicRef === OTHER_TOPIC_REF) ?? null,
    generatedCount: generatedList.length,
    regeneratedCount: generatedList.filter((summary) => summary.attemptList.length > 1).length,
    blockerCodeList: countCodeList(
      attemptList.flatMap((attempt) => attempt.blockerList.map(codeOf)),
    ),
    warningCodeList: countCodeList(
      attemptList.flatMap((attempt) => attempt.warningList.map(codeOf)),
    ),
    generationFailCodeList: countCodeList(
      summaryList.flatMap((summary) =>
        summary.failedStage === "generate" || summary.failedStage === "render"
          ? [summary.failCode ?? "unknown"]
          : [],
      ),
    ),
    aiCallOutcomeList: aiStageList.flatMap((stage) =>
      countCodeList(
        summaryList.flatMap((summary) =>
          summary.aiCallList
            .filter((call) => call.stage === stage && call.outcomeCode !== AI_CALL_OK_OUTCOME_CODE)
            .map((call) => call.outcomeCode),
        ),
      ).map((entry) => ({ stage, ...entry })),
    ),
    previewCost,
    kitCost,
    generationDuration,
    gateCriterionList: gateCriterionListOf(
      caseRowList,
      resultList,
      previewCost,
      kitCost,
      generationDuration,
      context.usdBrlRate,
    ),
  };
}

export function regressionDocFileNameOf(report: RegressionReport): string {
  return `${report.date}-${report.generationVersion}.md`;
}

const verdictLabelMap: Readonly<Record<GateVerdict, string>> = {
  pass: "ok",
  fail: "falhou",
  not_evaluated: "não avaliado",
};

const DEFAULT_EFFORT_TEXT = "padrão do adaptador";

function aiSettingText({
  extractModel,
  extractEffort,
  generateModel,
  generateEffort,
}: RegressionAiSetting): string {
  return `extração ${extractModel} (esforço ${extractEffort ?? DEFAULT_EFFORT_TEXT}) e geração ${generateModel} (esforço ${generateEffort ?? DEFAULT_EFFORT_TEXT})`;
}

function listText(valueList: readonly string[]): string {
  return valueList.length === 0 ? "—" : valueList.join(", ");
}

function optionalText<T>(value: T | null, format: (value: T) => string): string {
  return value === null ? "—" : format(value);
}

function previewText(row: CaseReportRow): string {
  if (row.actualPreview === null) return "—";
  const { outcome, failCode } = row.actualPreview;
  return failCode === null ? outcome : `${outcome} (${failCode})`;
}

function kitText(row: CaseReportRow): string {
  const actual =
    row.crashErrorName === null
      ? row.actualKitOutcome
      : `${row.actualKitOutcome} (${row.crashErrorName})`;
  const withCode =
    row.actualKitOutcome === "failed" && row.failCode !== null
      ? `${actual} (${row.failCode})`
      : actual;
  return row.actualKitOutcome === row.expectedKitOutcome
    ? withCode
    : `${withCode}; esperado ${row.expectedKitOutcome}`;
}

function pageText(row: CaseReportRow): string {
  return row.activitiesPageCount === null
    ? "—"
    : `${row.activitiesPageCount} + ${row.answerKeyPageCount}`;
}

function distributionText(
  distribution: Distribution | null,
  format: (value: number) => string,
): string {
  return distribution === null
    ? "sem dado"
    : `média ${format(distribution.mean)} · p50 ${format(distribution.p50)} · p95 ${format(distribution.p95)}`;
}

function codeCountText(codeCountList: readonly CodeCount[]): string {
  return listText(codeCountList.map((entry) => `${entry.code} × ${entry.count}`));
}

const costStageList: readonly AiStage[] = aiStageList;
const durationStageList: readonly PipelineStage[] = ["analyze", "generate", "render"];

function stageCostText(row: CaseReportRow, stage: AiStage): string {
  const costCents = row.costCentsByStage[stage];
  return costCents === undefined ? "—" : formatDollar(costCents);
}

function stageDurationText(row: CaseReportRow, stage: PipelineStage): string {
  const durationMs = row.durationMsByStage[stage];
  return durationMs === undefined ? "—" : formatDuration(durationMs);
}

function topicRowLine(row: TopicReportRow): string {
  return `| ${row.topicRef} | ${row.caseCount} | ${row.readyCount} | ${row.regeneratedCount} | ${listText(row.firstAttemptBlockerCodeList)} |`;
}

export function formatRegressionMarkdown(report: RegressionReport): string {
  const roundText = report.isComplete
    ? `completa, ${report.caseRowList.length} casos`
    : `parcial, ${report.caseRowList.length} casos`;
  const lineList = [
    `# Regressão pedagógica ${report.date} · ${report.generationVersion}`,
    "",
    `Rodada ${report.runId} (${roundText}). Modelos: ${aiSettingText(report.aiSetting)}. Câmbio usado nos critérios de custo: ${report.usdBrlRate} reais por dólar. Só ids, códigos e números: o material, o pedido e o kit ficam na saída da rodada, fora do git.`,
    "",
    "## Critérios do gate (spec pedagógica §13.2)",
    "",
    "| # | Critério | Meta | Valor | Resultado |",
    "|---|---|---|---|---|",
    ...report.gateCriterionList.map(
      (criterion) =>
        `| ${criterion.number} | ${criterion.label} | ${criterion.target} | ${criterion.value} | ${verdictLabelMap[criterion.verdict]} |`,
    ),
    "",
    `Bloqueadores críticos inesperados: ${listText(report.criticalCaseIdList)}.`,
    "",
    "## Verificações",
    "",
    "| Verificação | Casos com falha |",
    "|---|---|",
    ...report.checkFailureList.map((entry) => `| ${entry.code} | ${entry.count} |`),
    "",
    "## Casos",
    "",
    "| Caso | Prévia | Kit | Falhas | Avisos | Bloqueadores da 1ª tentativa | Tentativas | Custo da prévia | Custo do kit | Geração | Páginas |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...report.caseRowList.map(
      (row) =>
        `| ${row.caseId} | ${previewText(row)} | ${kitText(row)} | ${listText(row.failedCheckList)} | ${listText(row.warningList)} | ${listText(row.firstAttemptBlockerCodeList)} | ${listText(row.repairList)} | ${optionalText(row.previewCostCents, formatDollar)} | ${optionalText(row.kitCostCents, formatDollar)} | ${optionalText(row.generationDurationMs, formatDuration)} | ${pageText(row)} |`,
    ),
    "",
    "### Custo e tempo por etapa",
    "",
    `| Caso | ${costStageList.map((stage) => `Custo ${aiStageLabelMap[stage]}`).join(" | ")} | ${durationStageList.map((stage) => `Tempo ${pipelineStageLabelMap[stage]}`).join(" | ")} | Avisos da 1ª tentativa |`,
    `|---|${[...costStageList, ...durationStageList].map(() => "---|").join("")}---|`,
    ...report.caseRowList.map(
      (row) =>
        `| ${row.caseId} | ${costStageList.map((stage) => stageCostText(row, stage)).join(" | ")} | ${durationStageList.map((stage) => stageDurationText(row, stage)).join(" | ")} | ${listText(countCodeList(row.firstAttemptWarningCodeList).map((entry) => `${entry.code} × ${entry.count}`))} |`,
    ),
    "",
    "## Por assunto",
    "",
    "| Assunto | Kits | Prontos | Regenerados | Bloqueadores da 1ª tentativa |",
    "|---|---|---|---|---|",
    ...report.topicRowList.map(topicRowLine),
    "",
    "### Outro",
    "",
    ...(report.otherTopicRow === null
      ? ["Nenhum kit com assunto outro."]
      : [
          "| Assunto | Kits | Prontos | Regenerados | Bloqueadores da 1ª tentativa |",
          "|---|---|---|---|---|",
          topicRowLine(report.otherTopicRow),
        ]),
    "",
    "## Geração",
    "",
    `- Kits gerados: ${report.generatedCount}; com regeneração: ${report.regeneratedCount} (${report.generatedCount === 0 ? "—" : percentFormat.format(report.regeneratedCount / report.generatedCount)}).`,
    `- Bloqueadores, em todas as tentativas: ${codeCountText(report.blockerCodeList)}.`,
    `- Avisos, em todas as tentativas: ${codeCountText(report.warningCodeList)}.`,
    `- Falhas da geração ou do render: ${codeCountText(report.generationFailCodeList)}.`,
    `- Chamadas de IA sem sucesso, por etapa: ${listText(report.aiCallOutcomeList.map((entry) => `${entry.stage} ${entry.code} × ${entry.count}`))}.`,
    "",
    "## Custo e tempo",
    "",
    `- Prévia (extração): ${distributionText(report.previewCost, formatDollar)}.`,
    `- Kit (todas as chamadas do pedido): ${distributionText(report.kitCost, formatDollar)}.`,
    `- Geração, do plano aos PDFs: ${distributionText(report.generationDuration, formatDuration)}.`,
    "",
  ];
  return lineList.join("\n");
}

export function formatRegressionTerminal(
  report: RegressionReport,
  outputDirectory: string,
): string {
  const lineList = [
    `Regressão ${report.isComplete ? "completa" : "parcial"}: ${report.caseRowList.length} casos; saída em ${outputDirectory}`,
    ...report.gateCriterionList.map(
      (criterion) =>
        `  ${criterion.number}. ${criterion.label}: ${criterion.value} (meta ${criterion.target}) → ${verdictLabelMap[criterion.verdict]}`,
    ),
    `  Bloqueadores críticos inesperados: ${listText(report.criticalCaseIdList)}`,
  ];
  return lineList.join("\n");
}

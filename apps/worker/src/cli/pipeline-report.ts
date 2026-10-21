import {
  type AiStage,
  aiStageList,
  findTopic,
  type Grade,
  type Legibility,
  OTHER_TOPIC_REF,
  type PerceivedDifficulty,
  type PhotoIssue,
  type Subject,
  type TopicConfidence,
  type TopicRef,
  type ValidationIssue,
} from "@gizito/core";
import type { AiCallRecord } from "#src/pipeline/ai-call.ts";
import type { PhotoExtractionStatus } from "#src/pipeline/extract.ts";
import { GENERATION_VERSION, type GenerationAttemptRepair } from "#src/pipeline/generate.ts";
import {
  type PipelineFailureCode,
  type PipelineRequest,
  type PipelineRun,
  type PipelineStage,
  pipelineStageList,
  TOPIC_CONFIRMATION_REQUIRED_CODE,
} from "#src/pipeline/run-pipeline.ts";
import { errorNameOf } from "#src/render/pdf-renderer.ts";

export type PipelineSummary = {
  readonly status: "ready" | "failed";
  readonly failedStage: PipelineStage | null;
  readonly failCode: PipelineFailureCode | null;
  readonly grade: Grade;
  readonly subject: Subject;
  readonly generationVersion: string;
  readonly perceivedDifficulty: PerceivedDifficulty | null;
  readonly hasOtherTopicText: boolean;
  readonly hasNoteText: boolean;
  readonly photoCount: number;
  readonly photoList: readonly {
    readonly photoIndex: number;
    readonly status: PhotoExtractionStatus | null;
    readonly legibility: Legibility | null;
    readonly isUsable: boolean;
    readonly photoIssueList: readonly PhotoIssue[];
  }[];
  readonly topicCandidateList: readonly {
    readonly topicId: string;
    readonly confidence: TopicConfidence;
    readonly photoIndexList: readonly number[];
  }[];
  readonly unsupportedTopicIdList: readonly string[];
  readonly sourceWarningCodeList: readonly string[];
  readonly extractionIssueCodeList: readonly string[];
  readonly topicRefList: readonly TopicRef[] | null;
  readonly attemptList: readonly {
    readonly repair: GenerationAttemptRepair;
    readonly blockerList: readonly string[];
    readonly warningList: readonly string[];
  }[];
  readonly render: {
    readonly activitiesPageCount: number | null;
    readonly answerKeyPageCount: number | null;
    readonly issueCodeList: readonly string[];
    readonly errorNameList: readonly string[];
  } | null;
  readonly aiStageList: readonly {
    readonly stage: AiStage;
    readonly callCount: number;
    readonly inputTokenCount: number;
    readonly outputTokenCount: number;
    readonly costCents: number;
    readonly durationMs: number;
  }[];
  readonly durationMsByStage: Readonly<Partial<Record<PipelineStage, number>>>;
  readonly totalCostCents: number;
  readonly totalDurationMs: number;
  readonly aiCallList: readonly AiCallRecord[];
};

export type PipelineCrashSummary = {
  readonly status: "crashed";
  readonly failedStage: PipelineStage | null;
  readonly errorName: string;
};

export const pipelineStageLabelMap: Readonly<Record<PipelineStage, string>> = {
  analyze: "análise",
  confirm: "confirmação",
  generate: "geração",
  render: "render",
};

export const aiStageLabelMap: Readonly<Record<AiStage, string>> = {
  extract: "extração",
  plan: "plano",
  generate: "geração",
  review: "revisão",
};

const confidenceLabelMap: Readonly<Record<TopicConfidence, string>> = {
  high: "alta",
  medium: "média",
};

const dollarFormat = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const secondFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

function sumOf<T>(list: readonly T[], amountOf: (item: T) => number): number {
  return list.reduce((total, item) => total + amountOf(item), 0);
}

function issueTextOf(issue: ValidationIssue): string {
  return `${issue.code}:${issue.itemId ?? "-"}`;
}

function issueTextListOf(
  issueList: readonly ValidationIssue[],
  severity: ValidationIssue["severity"],
): readonly string[] {
  return issueList.filter((issue) => issue.severity === severity).map(issueTextOf);
}

function renderSummaryOf(render: PipelineRun["render"]): PipelineSummary["render"] {
  if (render === null) return null;
  if (!render.ok) {
    return {
      activitiesPageCount: null,
      answerKeyPageCount: null,
      issueCodeList: render.error.issueList.map((issue) => issue.code),
      errorNameList: render.error.errorNameList,
    };
  }
  return {
    activitiesPageCount: render.value.activities.pageCount,
    answerKeyPageCount: render.value.answerKey.pageCount,
    issueCodeList: render.value.warningList.map((issue) => issue.code),
    errorNameList: [],
  };
}

function generationOutcomeOf(generation: PipelineRun["generation"]) {
  if (generation === null) return null;
  return generation.ok ? generation.value : generation.error;
}

export function buildPipelineSummary(run: PipelineRun, request: PipelineRequest): PipelineSummary {
  const analysis = run.analysis.ok ? run.analysis.value : null;
  const merged = analysis?.mergedExtraction ?? null;
  const generation = generationOutcomeOf(run.generation);
  const durationMsByStage = run.durationMsByStage;
  return {
    status: run.outcome.status,
    failedStage: run.outcome.status === "failed" ? run.outcome.stage : null,
    failCode: run.outcome.status === "failed" ? run.outcome.code : null,
    grade: request.grade,
    subject: request.subject,
    generationVersion: GENERATION_VERSION,
    perceivedDifficulty: request.perceivedDifficulty,
    hasOtherTopicText: request.otherTopicText !== null,
    hasNoteText: request.noteText !== null,
    photoCount: request.photoList.length,
    photoList: (merged?.photoList ?? []).map((photo, index) => ({
      photoIndex: photo.photoIndex,
      status: analysis?.photoStatusList[index] ?? null,
      legibility: photo.legibility,
      isUsable: photo.isUsable,
      photoIssueList: photo.photoIssueList,
    })),
    topicCandidateList: (merged?.topicCandidateList ?? []).map((candidate) => ({
      topicId: candidate.topicId,
      confidence: candidate.confidence,
      photoIndexList: candidate.photoIndexList,
    })),
    unsupportedTopicIdList: (merged?.unsupportedTopicList ?? []).map(
      (topic) => topic.unsupportedTopicId,
    ),
    sourceWarningCodeList: (merged?.sourceWarningList ?? []).map((warning) => warning.code),
    extractionIssueCodeList: (merged?.issueList ?? []).map((issue) => issue.code),
    topicRefList: run.topicRefList,
    attemptList: (generation?.attemptList ?? []).map((attempt) => ({
      repair: attempt.repair,
      blockerList: issueTextListOf(attempt.issueList, "blocker"),
      warningList: issueTextListOf(attempt.issueList, "warning"),
    })),
    render: renderSummaryOf(run.render),
    aiStageList: aiStageList.map((stage) => {
      const callList = run.aiCallList.filter((call) => call.stage === stage);
      return {
        stage,
        callCount: callList.length,
        inputTokenCount: sumOf(callList, (call) => call.inputTokenCount),
        outputTokenCount: sumOf(callList, (call) => call.outputTokenCount),
        costCents: sumOf(callList, (call) => call.costCents),
        durationMs: sumOf(callList, (call) => call.durationMs),
      };
    }),
    durationMsByStage,
    totalCostCents: sumOf(run.aiCallList, (call) => call.costCents),
    totalDurationMs: sumOf(Object.values(durationMsByStage), (durationMs) => durationMs),
    aiCallList: run.aiCallList,
  };
}

export function formatDollar(costCents: number): string {
  return dollarFormat.format(costCents / 100);
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = durationMs / 1000;
  if (totalSeconds < 60) return `${secondFormat.format(totalSeconds)} s`;
  const minuteCount = Math.floor(totalSeconds / 60);
  return `${minuteCount} min ${Math.round(totalSeconds - minuteCount * 60)} s`;
}

function topicTextOf(topicRef: TopicRef): string {
  if (topicRef === OTHER_TOPIC_REF) return "outro";
  const topic = findTopic(topicRef);
  return topic === undefined ? topicRef : `${topicRef} (${topic.label})`;
}

function headlineOf(summary: PipelineSummary, outputDirectory: string): string {
  if (summary.status === "ready") return `Kit pronto em ${outputDirectory}`;
  const stage = summary.failedStage === null ? "" : pipelineStageLabelMap[summary.failedStage];
  return `Pedido parou na etapa de ${stage} com ${summary.failCode}; saída em ${outputDirectory}`;
}

export function formatPipelineSummary(summary: PipelineSummary, outputDirectory: string): string {
  const lineList = [headlineOf(summary, outputDirectory)];
  const usableCount = summary.photoList.filter((photo) => photo.isUsable).length;
  const photoText = summary.photoList
    .map((photo) => `#${photo.photoIndex} ${photo.legibility ?? "sem leitura"}`)
    .join(", ");
  lineList.push(
    `  Fotos: ${summary.photoCount}, ${usableCount} utilizáveis${photoText === "" ? "" : ` (${photoText})`}`,
  );
  if (summary.topicCandidateList.length > 0) {
    const candidateText = summary.topicCandidateList
      .map((candidate) => `${candidate.topicId} (${confidenceLabelMap[candidate.confidence]})`)
      .join(", ");
    lineList.push(`  Candidatos: ${candidateText}`);
  }
  if (summary.failCode === TOPIC_CONFIRMATION_REQUIRED_CODE) {
    lineList.push("  Nenhum candidato de confiança alta: escolha os assuntos com --topics");
  }
  if (summary.unsupportedTopicIdList.length > 0) {
    lineList.push(`  Não atendidos: ${summary.unsupportedTopicIdList.join(", ")}`);
  }
  if (summary.sourceWarningCodeList.length > 0) {
    lineList.push(`  Avisos do material: ${summary.sourceWarningCodeList.join(", ")}`);
  }
  if (summary.topicRefList !== null) {
    lineList.push(`  Assuntos: ${summary.topicRefList.map(topicTextOf).join(", ")}`);
  }
  if (summary.attemptList.length > 0) {
    lineList.push(
      `  Tentativas: ${summary.attemptList.map((attempt) => attempt.repair).join(" → ")}`,
    );
    const blockerList = summary.attemptList.flatMap((attempt) => attempt.blockerList);
    if (blockerList.length > 0) lineList.push(`  Bloqueadores: ${blockerList.join(", ")}`);
  }
  const { render } = summary;
  if (render !== null && render.activitiesPageCount !== null) {
    lineList.push(
      `  PDFs: atividades com ${render.activitiesPageCount} páginas, gabarito com ${render.answerKeyPageCount}`,
    );
  }
  const renderCodeList = render === null ? [] : [...render.issueCodeList, ...render.errorNameList];
  if (renderCodeList.length > 0) lineList.push(`  Render: ${renderCodeList.join(", ")}`);
  const stageCostText = summary.aiStageList
    .filter((stage) => stage.callCount > 0)
    .map((stage) => `${aiStageLabelMap[stage.stage]} ${formatDollar(stage.costCents)}`)
    .join(" · ");
  lineList.push(
    `  Custo: ${formatDollar(summary.totalCostCents)}${stageCostText === "" ? "" : ` (${stageCostText})`}`,
  );
  const stageDurationText = pipelineStageList
    .flatMap((stage) => {
      const durationMs = summary.durationMsByStage[stage];
      return durationMs === undefined
        ? []
        : [`${pipelineStageLabelMap[stage]} ${formatDuration(durationMs)}`];
    })
    .join(" · ");
  lineList.push(`  Tempo: ${formatDuration(summary.totalDurationMs)} (${stageDurationText})`);
  return lineList.join("\n");
}

export function buildPipelineCrashSummary(
  failedStage: PipelineStage | null,
  error: unknown,
): PipelineCrashSummary {
  return {
    status: "crashed",
    failedStage,
    errorName: errorNameOf(error),
  };
}

export function formatPipelineCrashSummary(
  summary: PipelineCrashSummary,
  outputDirectory: string,
): string {
  const stage =
    summary.failedStage === null
      ? "antes da primeira etapa"
      : `na etapa de ${pipelineStageLabelMap[summary.failedStage]}`;
  return `Erro inesperado ${stage}: ${summary.errorName}; resumo em ${outputDirectory}`;
}

import {
  type AiProvider,
  err,
  type Grade,
  JOB_MAX_RUN_SECONDS,
  MAX_TOPIC_COUNT,
  type MathEvaluator,
  type MergedTopicCandidate,
  OTHER_TOPIC_REF,
  ok,
  type PerceivedDifficulty,
  type PreviewFailCode,
  type Result,
  type Subject,
  type TopicRef,
} from "@gizito/core";
import type { AiCallRecord } from "#src/pipeline/ai-call.ts";
import {
  analyzeMaterial,
  type ExtractionFailure,
  type ExtractionFailureCode,
  type ExtractionPhoto,
  type MaterialAnalysis,
} from "#src/pipeline/extract.ts";
import {
  createMemoryExtractionCache,
  type ExtractionCache,
} from "#src/pipeline/extraction-cache.ts";
import {
  type GeneratedKit,
  type GenerationFailure,
  type GenerationFailureCode,
  generateKit,
} from "#src/pipeline/generate.ts";
import type { MathMarkupParser } from "#src/pipeline/math-markup.ts";
import type { PdfRenderer } from "#src/render/pdf-renderer.ts";
import { type KitRenderFailure, type RenderedKit, renderKit } from "#src/render/render-kit.ts";

export const pipelineStageList = ["analyze", "confirm", "generate", "render"] as const;
export type PipelineStage = (typeof pipelineStageList)[number];

export const TOPIC_CONFIRMATION_REQUIRED_CODE = "topic_confirmation_required";

export type PipelineFailureCode =
  | ExtractionFailureCode
  | PreviewFailCode
  | typeof TOPIC_CONFIRMATION_REQUIRED_CODE
  | GenerationFailureCode
  | KitRenderFailure["code"];

export type PipelineRequest = {
  readonly grade: Grade;
  readonly subject: Subject;
  readonly photoList: readonly ExtractionPhoto[];
  readonly topicIdList: readonly string[] | null;
  readonly otherTopicText: string | null;
  readonly perceivedDifficulty: PerceivedDifficulty | null;
  readonly noteText: string | null;
};

export type PipelineDependencies = {
  readonly aiProvider: AiProvider;
  readonly extractModel: string;
  readonly mathEvaluator: MathEvaluator;
  readonly isMathMarkupParsable: MathMarkupParser;
  readonly pdfRenderer: PdfRenderer;
  readonly now: () => Date;
  readonly maxCostCents?: number;
  readonly createStageSignal?: () => AbortSignal;
  readonly onStageStart?: (stage: PipelineStage) => void;
  readonly extractionCache?: ExtractionCache;
};

export type PipelineOutcome =
  | { readonly status: "ready" }
  | {
      readonly status: "failed";
      readonly stage: PipelineStage;
      readonly code: PipelineFailureCode;
    };

export type PipelineRun = {
  readonly outcome: PipelineOutcome;
  readonly analysis: Result<MaterialAnalysis, ExtractionFailure>;
  readonly topicRefList: readonly TopicRef[] | null;
  readonly generation: Result<GeneratedKit, GenerationFailure> | null;
  readonly render: Result<RenderedKit, KitRenderFailure> | null;
  readonly aiCallList: readonly AiCallRecord[];
  readonly durationMsByStage: Readonly<Partial<Record<PipelineStage, number>>>;
};

function createJobSignal(): AbortSignal {
  return AbortSignal.timeout(JOB_MAX_RUN_SECONDS * 1000);
}

type PipelineRunProgress = Partial<Pick<PipelineRun, "topicRefList" | "generation" | "render">>;

function costOf(aiCallList: readonly AiCallRecord[]): number {
  return aiCallList.reduce((total, call) => total + call.costCents, 0);
}

function generationCallListOf(generation: PipelineRun["generation"]): readonly AiCallRecord[] {
  if (generation === null) return [];
  return generation.ok ? generation.value.aiCallList : generation.error.aiCallList;
}

export function confirmTopicRefList(
  request: Pick<PipelineRequest, "topicIdList" | "otherTopicText">,
  topicCandidateList: readonly MergedTopicCandidate[],
): Result<readonly TopicRef[], typeof TOPIC_CONFIRMATION_REQUIRED_CODE> {
  const otherTopicRefList: readonly TopicRef[] =
    request.otherTopicText === null ? [] : [OTHER_TOPIC_REF];
  const topicIdList =
    request.topicIdList ??
    topicCandidateList
      .filter((candidate) => candidate.confidence === "high")
      .map((candidate) => candidate.topicId)
      .slice(0, MAX_TOPIC_COUNT - otherTopicRefList.length);
  const topicRefList = [...topicIdList, ...otherTopicRefList];
  return topicRefList.length === 0 ? err(TOPIC_CONFIRMATION_REQUIRED_CODE) : ok(topicRefList);
}

export async function runPipeline(
  request: PipelineRequest,
  dependencies: PipelineDependencies,
): Promise<PipelineRun> {
  const {
    aiProvider,
    now,
    createStageSignal = createJobSignal,
    onStageStart,
    extractionCache = createMemoryExtractionCache(),
  } = dependencies;
  const durationMsByStage: Partial<Record<PipelineStage, number>> = {};
  const timed = async <T>(stage: PipelineStage, work: () => Promise<T>): Promise<T> => {
    onStageStart?.(stage);
    const startedAt = performance.now();
    try {
      return await work();
    } finally {
      durationMsByStage[stage] = Math.round(performance.now() - startedAt);
    }
  };
  const context = { grade: request.grade, subject: request.subject };
  const analysis = await timed("analyze", () =>
    analyzeMaterial(request.photoList, context, {
      aiProvider,
      cache: extractionCache,
      extractModel: dependencies.extractModel,
      now,
      signal: createStageSignal(),
    }),
  );
  const extractCallList = analysis.ok ? analysis.value.aiCallList : analysis.error.aiCallList;
  const runOf = (
    outcome: PipelineOutcome,
    { topicRefList = null, generation = null, render = null }: PipelineRunProgress = {},
  ): PipelineRun => ({
    outcome,
    analysis,
    topicRefList,
    generation,
    render,
    aiCallList: [...extractCallList, ...generationCallListOf(generation)],
    durationMsByStage,
  });
  if (!analysis.ok) {
    return runOf({ status: "failed", stage: "analyze", code: analysis.error.code });
  }
  const { mergedExtraction, previewOutcome } = analysis.value;
  if (previewOutcome.outcome === "analysis_failed") {
    return runOf({ status: "failed", stage: "analyze", code: previewOutcome.failCode });
  }
  onStageStart?.("confirm");
  const confirmed = confirmTopicRefList(request, mergedExtraction.topicCandidateList);
  if (!confirmed.ok) return runOf({ status: "failed", stage: "confirm", code: confirmed.error });
  const topicRefList = confirmed.value;
  const generation = await timed("generate", () =>
    generateKit(
      {
        ...context,
        topicRefList,
        perceivedDifficulty: request.perceivedDifficulty,
        noteText: request.noteText,
        otherTopicText: request.otherTopicText,
        materialProfile: mergedExtraction.materialProfile,
        sourceWarningCodeList: mergedExtraction.sourceWarningList.map((warning) => warning.code),
      },
      {
        aiProvider,
        mathEvaluator: dependencies.mathEvaluator,
        isMathMarkupParsable: dependencies.isMathMarkupParsable,
        spentCostCents: costOf(extractCallList),
        maxCostCents: dependencies.maxCostCents,
        signal: createStageSignal(),
      },
    ),
  );
  if (!generation.ok) {
    return runOf(
      { status: "failed", stage: "generate", code: generation.error.code },
      { topicRefList, generation },
    );
  }
  const render = await timed("render", () =>
    renderKit(
      { studyKit: generation.value.studyKit, generatedAt: now() },
      { pdfRenderer: dependencies.pdfRenderer },
    ),
  );
  return render.ok
    ? runOf({ status: "ready" }, { topicRefList, generation, render })
    : runOf(
        { status: "failed", stage: "render", code: render.error.code },
        { topicRefList, generation, render },
      );
}

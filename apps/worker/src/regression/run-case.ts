import { MAX_TOPIC_COUNT } from "@gizito/core";
import type { ExtractionPhoto } from "#src/pipeline/extract.ts";
import { createMemoryExtractionCache } from "#src/pipeline/extraction-cache.ts";
import {
  type PipelineDependencies,
  type PipelineRequest,
  type PipelineStage,
  runPipeline,
} from "#src/pipeline/run-pipeline.ts";
import type { CaseRunOutcome } from "#src/regression/case-check.ts";
import type { RegressionCase } from "#src/regression/regression-case.ts";
import { errorNameOf } from "#src/render/pdf-renderer.ts";

export type CaseRunDependencies = Omit<PipelineDependencies, "onStageStart" | "extractionCache">;

export function caseRequestOf(
  regressionCase: RegressionCase,
  photoList: readonly ExtractionPhoto[],
): PipelineRequest {
  const { confirmation, expectedPreview } = regressionCase;
  const defaultTopicIdList =
    regressionCase.expectedKitOutcome === "not_applicable"
      ? []
      : expectedPreview.requiredTopicIdList.slice(0, MAX_TOPIC_COUNT);
  return {
    grade: regressionCase.grade,
    subject: regressionCase.subject,
    photoList,
    topicIdList: confirmation?.topicIdList ?? defaultTopicIdList,
    otherTopicText: confirmation?.otherTopicText ?? null,
    perceivedDifficulty: confirmation?.perceivedDifficulty ?? null,
    noteText: confirmation?.noteText ?? null,
  };
}

export async function runRegressionCase(
  request: PipelineRequest,
  dependencies: CaseRunDependencies,
): Promise<CaseRunOutcome> {
  const progress: { stage: PipelineStage | null } = { stage: null };
  const extractionCache = createMemoryExtractionCache();
  try {
    const run = await runPipeline(request, {
      ...dependencies,
      extractionCache,
      onStageStart: (stage) => {
        progress.stage = stage;
      },
    });
    const photoExtractionList = [...extractionCache.entryMap.values()].map(
      (entry) => entry.extraction,
    );
    return { kind: "ran", run, photoExtractionList };
  } catch (error) {
    return { kind: "crashed", stage: progress.stage, errorName: errorNameOf(error) };
  }
}

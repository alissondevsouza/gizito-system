import { z } from "zod";
import { guidSchema } from "#src/common.ts";
import { MAX_PHOTO_COUNT } from "#src/constants.ts";
import type { OrderStatus } from "#src/enums.ts";
import type { OrderEvent } from "#src/order/state-machine.ts";
import { type MergedExtraction, mergedExtractionSchema } from "#src/pedagogy/extraction/merge.ts";
import {
  type PreviewOutcome,
  previewFailCodeList,
  previewFailCodeSchema,
} from "#src/pedagogy/extraction/preview.ts";

export const ANALYSIS_UNAVAILABLE_FAIL_CODE = "analysis_unavailable";

export const analysisFailCodeList = [
  ...previewFailCodeList,
  ANALYSIS_UNAVAILABLE_FAIL_CODE,
] as const;
export const analysisFailCodeSchema = z.enum(analysisFailCodeList);
export type AnalysisFailCode = z.infer<typeof analysisFailCodeSchema>;

const analyzedPhotoIdListSchema = z
  .array(guidSchema)
  .min(1)
  .max(MAX_PHOTO_COUNT)
  .refine((idList) => new Set(idList).size === idList.length, {
    message: "analyzedPhotoIdList must not repeat an id",
  });

const concludedAnalysisShape = {
  analyzedPhotoIdList: analyzedPhotoIdListSchema,
  mergedExtraction: mergedExtractionSchema,
};

export const orderAnalysisSchema = z
  .discriminatedUnion("outcome", [
    z.strictObject({ outcome: z.literal("preview_ready"), ...concludedAnalysisShape }),
    z.strictObject({
      outcome: z.literal("analysis_failed"),
      failCode: previewFailCodeSchema,
      isMaterialMismatch: z.boolean(),
      ...concludedAnalysisShape,
    }),
    z.strictObject({ outcome: z.literal(ANALYSIS_UNAVAILABLE_FAIL_CODE) }),
  ])
  .refine(
    (analysis) =>
      analysis.outcome === ANALYSIS_UNAVAILABLE_FAIL_CODE ||
      analysis.analyzedPhotoIdList.length === analysis.mergedExtraction.photoList.length,
    {
      message: "analyzedPhotoIdList must have one id per merged photo",
      path: ["analyzedPhotoIdList"],
    },
  );
export type OrderAnalysis = z.infer<typeof orderAnalysisSchema>;

export const unavailableOrderAnalysis: OrderAnalysis = { outcome: ANALYSIS_UNAVAILABLE_FAIL_CODE };

export function buildOrderAnalysis(
  analyzedPhotoIdList: readonly string[],
  mergedExtraction: MergedExtraction,
  previewOutcome: PreviewOutcome,
): OrderAnalysis {
  const concluded = { analyzedPhotoIdList: [...analyzedPhotoIdList], mergedExtraction };
  return orderAnalysisSchema.parse(
    previewOutcome.outcome === "preview_ready"
      ? { outcome: "preview_ready", ...concluded }
      : {
          outcome: "analysis_failed",
          failCode: previewOutcome.failCode,
          isMaterialMismatch: previewOutcome.isMaterialMismatch,
          ...concluded,
        },
  );
}

export function analysisEventOf(analysis: OrderAnalysis): OrderEvent {
  return analysis.outcome === "preview_ready" ? "analysis_succeeded" : "analysis_failed";
}

export const analysisStartDecisionList = ["start", "resume", "skip"] as const;
export type AnalysisStartDecision = (typeof analysisStartDecisionList)[number];

export function decideAnalysisStart(
  status: OrderStatus,
  hasAnalysis: boolean,
): AnalysisStartDecision {
  if (status === "analyzing") return "resume";
  if (status === "draft" && !hasAnalysis) return "start";
  return "skip";
}

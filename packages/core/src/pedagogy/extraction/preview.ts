import { z } from "zod";
import type { MergedExtraction } from "#src/pedagogy/extraction/merge.ts";

export const previewFailCodeList = [
  "photos_unreadable",
  "only_unsupported_topics",
  "no_topic_found",
] as const;
export const previewFailCodeSchema = z.enum(previewFailCodeList);
export type PreviewFailCode = z.infer<typeof previewFailCodeSchema>;

export type PreviewOutcome =
  | { readonly outcome: "preview_ready"; readonly event: "analysis_succeeded" }
  | {
      readonly outcome: "analysis_failed";
      readonly event: "analysis_failed";
      readonly failCode: PreviewFailCode;
      readonly isMaterialMismatch: boolean;
    };

function analysisFailed(failCode: PreviewFailCode, isMaterialMismatch = false): PreviewOutcome {
  return { outcome: "analysis_failed", event: "analysis_failed", failCode, isMaterialMismatch };
}

export function decidePreviewOutcome(merged: MergedExtraction): PreviewOutcome {
  if (!merged.photoList.some((photo) => photo.isUsable)) return analysisFailed("photos_unreadable");
  if (merged.topicCandidateList.length > 0) {
    return { outcome: "preview_ready", event: "analysis_succeeded" };
  }
  if (merged.unsupportedTopicList.length > 0) return analysisFailed("only_unsupported_topics");
  return analysisFailed(
    "no_topic_found",
    merged.sourceWarningList.some(
      (warning) => warning.code === "subject_mismatch" || warning.code === "grade_mismatch",
    ),
  );
}

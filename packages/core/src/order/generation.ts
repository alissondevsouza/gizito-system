import { OTHER_TOPIC_REF } from "#src/constants.ts";
import type { Grade, OrderStatus, PerceivedDifficulty, Subject } from "#src/enums.ts";
import { orderAnalysisSchema } from "#src/order/analysis.ts";
import type { TopicId } from "#src/order/schemas.ts";
import {
  type MaterialProfile,
  materialProfileSchema,
  type SourceWarningCode,
} from "#src/pedagogy/extraction/schemas.ts";
import type { TopicRef } from "#src/pedagogy/kit-item.ts";
import { isSelectableTopic } from "#src/pedagogy/taxonomy/index.ts";
import { err, ok, type Result } from "#src/result.ts";

export const generationStartDecisionList = ["start", "resume", "skip"] as const;
export type GenerationStartDecision = (typeof generationStartDecisionList)[number];

export function decideGenerationStart(status: OrderStatus): GenerationStartDecision {
  if (status === "paid") return "start";
  if (status === "processing") return "resume";
  return "skip";
}

export const GENERATION_INPUT_INVALID_CODE = "generation_input_invalid";

export const generationInputInvalidReasonList = [
  "material_profile_invalid",
  "topic_list_empty",
  "topic_not_selectable",
] as const;
export type GenerationInputInvalidReason = (typeof generationInputInvalidReasonList)[number];

export class GenerationInputError extends Error {
  readonly code = GENERATION_INPUT_INVALID_CODE;

  constructor(readonly reason: GenerationInputInvalidReason) {
    super(`Order cannot be generated: ${reason}`);
    this.name = "GenerationInputError";
  }
}

export type GenerationOrderFields = {
  readonly grade: Grade;
  readonly subject: Subject;
  readonly topicIdList: readonly TopicId[];
  readonly otherTopicText: string | null;
  readonly perceivedDifficulty: PerceivedDifficulty | null;
  readonly noteText: string | null;
  readonly materialProfile: unknown;
  readonly analysis: unknown;
};

export type GenerationInput = {
  readonly grade: Grade;
  readonly subject: Subject;
  readonly topicRefList: readonly TopicRef[];
  readonly otherTopicText: string | null;
  readonly perceivedDifficulty: PerceivedDifficulty | null;
  readonly noteText: string | null;
  readonly materialProfile: MaterialProfile;
  readonly sourceWarningCodeList: readonly SourceWarningCode[];
};

export function sourceWarningCodeListOf(analysis: unknown): SourceWarningCode[] {
  const parsed = orderAnalysisSchema.safeParse(analysis);
  if (!parsed.success || parsed.data.outcome === "analysis_unavailable") return [];
  return parsed.data.mergedExtraction.sourceWarningList.map((warning) => warning.code);
}

export function buildGenerationInput(
  fields: GenerationOrderFields,
): Result<GenerationInput, GenerationInputError> {
  const { grade, subject, topicIdList, otherTopicText, perceivedDifficulty, noteText } = fields;
  const profile = materialProfileSchema.safeParse(fields.materialProfile);
  if (!profile.success) return err(new GenerationInputError("material_profile_invalid"));
  if (!topicIdList.every((topicId) => isSelectableTopic(topicId, grade, subject))) {
    return err(new GenerationInputError("topic_not_selectable"));
  }
  const topicRefList: readonly TopicRef[] = [
    ...topicIdList,
    ...(otherTopicText === null ? [] : [OTHER_TOPIC_REF]),
  ];
  if (topicRefList.length === 0) return err(new GenerationInputError("topic_list_empty"));
  return ok({
    grade,
    subject,
    topicRefList,
    otherTopicText,
    perceivedDifficulty,
    noteText,
    materialProfile: profile.data,
    sourceWarningCodeList: sourceWarningCodeListOf(fields.analysis),
  });
}

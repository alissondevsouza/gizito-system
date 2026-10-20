import { z } from "zod";
import {
  MAX_CONTEXT_THEME_COUNT,
  MAX_EVIDENCE_LENGTH,
  MAX_TERM_LENGTH,
  MAX_TERMINOLOGY_COUNT,
  MAX_TOPIC_CANDIDATE_COUNT,
} from "#src/constants.ts";
import { legibilitySchema } from "#src/enums.ts";
import { taxonomyTopicIdSchema, uniqueListSchema } from "#src/pedagogy/taxonomy/schemas.ts";
import { unsupportedTopicIdSchema } from "#src/pedagogy/taxonomy/unsupported.ts";

export const photoIssueList = [
  "blurry",
  "dark",
  "glare",
  "cropped",
  "tilted",
  "small_text",
  "hard_handwriting",
] as const;
export const photoIssueSchema = z.enum(photoIssueList);
export type PhotoIssue = z.infer<typeof photoIssueSchema>;

export const sourceWarningCodeList = [
  "personal_data_visible",
  "subject_mismatch",
  "grade_mismatch",
  "figure_dependent_content",
  "instruction_in_material",
] as const;
export const sourceWarningCodeSchema = z.enum(sourceWarningCodeList);
export type SourceWarningCode = z.infer<typeof sourceWarningCodeSchema>;

export const exerciseFormatList = [
  "multiple_choice",
  "fill_in_blank",
  "computation",
  "word_problem",
  "true_false",
  "matching",
  "open_answer",
  "text_comprehension",
  "table_or_chart",
] as const;
export const exerciseFormatSchema = z.enum(exerciseFormatList);
export type ExerciseFormat = z.infer<typeof exerciseFormatSchema>;

export const notationList = [
  "fraction_slash",
  "fraction_stacked",
  "mixed_number",
  "decimal_comma",
  "multiplication_x",
  "multiplication_dot",
  "division_obelus",
  "division_bracket",
  "percent_sign",
  "power_superscript",
] as const;
export const notationSchema = z.enum(notationList);
export type Notation = z.infer<typeof notationSchema>;

export const apparentLevelList = ["below_grade", "at_grade", "above_grade"] as const;
export const apparentLevelSchema = z.enum(apparentLevelList);
export type ApparentLevel = z.infer<typeof apparentLevelSchema>;

export const topicConfidenceList = ["high", "medium"] as const;
export const topicConfidenceSchema = z.enum(topicConfidenceList);
export type TopicConfidence = z.infer<typeof topicConfidenceSchema>;

export const MIN_EVIDENCE_LENGTH = 10;
export const MIN_PROFILE_TERM_LENGTH = 2;

const profileTermSchema = z.string().trim().min(MIN_PROFILE_TERM_LENGTH).max(MAX_TERM_LENGTH);

export const materialProfileSchema = z.strictObject({
  exerciseFormatList: uniqueListSchema(exerciseFormatSchema),
  notationList: uniqueListSchema(notationSchema),
  terminologyList: uniqueListSchema(profileTermSchema).max(MAX_TERMINOLOGY_COUNT),
  contextThemeList: uniqueListSchema(profileTermSchema).max(MAX_CONTEXT_THEME_COUNT),
  apparentLevel: apparentLevelSchema,
  hasFigures: z.boolean(),
  isHandwritten: z.boolean(),
});
export type MaterialProfile = z.infer<typeof materialProfileSchema>;

export const topicCandidateSchema = z.strictObject({
  topicId: taxonomyTopicIdSchema,
  confidence: topicConfidenceSchema,
  evidence: z.string().trim().min(MIN_EVIDENCE_LENGTH).max(MAX_EVIDENCE_LENGTH),
});
export type TopicCandidate = z.infer<typeof topicCandidateSchema>;

export const photoExtractionSchema = z.strictObject({
  legibility: legibilitySchema,
  isSchoolMaterial: z.boolean(),
  photoIssueList: uniqueListSchema(photoIssueSchema),
  topicCandidateList: z
    .array(topicCandidateSchema)
    .max(MAX_TOPIC_CANDIDATE_COUNT)
    .refine(
      (candidateList) =>
        new Set(candidateList.map((candidate) => candidate.topicId)).size === candidateList.length,
      { message: "topicCandidateList must not repeat a topicId" },
    ),
  unsupportedTopicIdList: uniqueListSchema(unsupportedTopicIdSchema),
  materialProfile: materialProfileSchema,
  sourceWarningCodeList: uniqueListSchema(sourceWarningCodeSchema),
});
export type PhotoExtraction = z.infer<typeof photoExtractionSchema>;

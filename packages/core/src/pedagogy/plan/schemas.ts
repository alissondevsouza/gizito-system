import { z } from "zod";
import {
  ANSWER_KEY_COUNT,
  MAX_BASE_TEXT_COUNT,
  MAX_TOPIC_COUNT,
  MIN_TOPIC_COUNT,
  WORKED_EXAMPLE_COUNT,
} from "#src/constants.ts";
import { questionBlockSchema, questionTypeSchema } from "#src/enums.ts";
import {
  baseTextIdSchema,
  questionIdSchema,
  topicRefSchema,
  workedExampleIdSchema,
} from "#src/pedagogy/kit-item.ts";
import { TOPIC_LABEL_MAX_LENGTH } from "#src/pedagogy/taxonomy/schemas.ts";

export const otherTopicVerdictList = ["feasible", "unfeasible"] as const;
export const otherTopicVerdictSchema = z.enum(otherTopicVerdictList);

export const otherTopicReasonCodeList = [
  "figure",
  "orality",
  "open_writing",
  "beyond_grade",
  "other_subject",
  "not_a_school_topic",
] as const;
export const otherTopicReasonCodeSchema = z.enum(otherTopicReasonCodeList);
export type OtherTopicReasonCode = z.infer<typeof otherTopicReasonCodeSchema>;

const planTextSchema = z.string().trim().min(10).max(140);

export const topicObjectiveSchema = z.strictObject({
  topicRef: topicRefSchema,
  objectiveList: z.array(planTextSchema).min(1).max(3),
});

export const slotDetailSchema = z.strictObject({
  slotId: questionIdSchema,
  questionType: questionTypeSchema,
  isContextualized: z.boolean(),
  skillFocus: planTextSchema,
  baseTextId: baseTextIdSchema.nullable(),
});
export type SlotDetail = z.infer<typeof slotDetailSchema>;

export const workedExampleFocusSchema = z.strictObject({
  exampleId: workedExampleIdSchema,
  focus: planTextSchema,
});

export const baseTextBriefSchema = z.strictObject({
  baseTextId: baseTextIdSchema,
  block: questionBlockSchema,
  genre: z.string().trim().min(3).max(40),
  theme: z.string().trim().min(3).max(80),
});
export type BaseTextBrief = z.infer<typeof baseTextBriefSchema>;

export const otherTopicAssessmentSchema = z
  .strictObject({
    verdict: otherTopicVerdictSchema,
    label: z.string().trim().min(3).max(TOPIC_LABEL_MAX_LENGTH),
    reasonCode: otherTopicReasonCodeSchema.nullable(),
  })
  .refine((assessment) => assessment.verdict === "feasible" || assessment.reasonCode !== null, {
    message: "an unfeasible other topic needs a reasonCode",
    path: ["reasonCode"],
  });
export type OtherTopicAssessment = z.infer<typeof otherTopicAssessmentSchema>;

export const kitPlanSchema = z.strictObject({
  topicObjectiveList: z.array(topicObjectiveSchema).min(MIN_TOPIC_COUNT).max(MAX_TOPIC_COUNT),
  slotDetailList: z.array(slotDetailSchema).length(ANSWER_KEY_COUNT),
  workedExampleFocusList: z.array(workedExampleFocusSchema).length(WORKED_EXAMPLE_COUNT),
  baseTextBriefList: z
    .array(baseTextBriefSchema)
    .max(MAX_BASE_TEXT_COUNT)
    .refine(
      (briefList) => new Set(briefList.map((brief) => brief.baseTextId)).size === briefList.length,
      { message: "baseTextBriefList must not repeat a baseTextId" },
    ),
  styleGuideList: z.array(planTextSchema).max(5),
  prerequisiteReminderList: z.array(planTextSchema).max(3),
  otherTopicAssessment: otherTopicAssessmentSchema.nullable(),
});
export type KitPlan = z.infer<typeof kitPlanSchema>;

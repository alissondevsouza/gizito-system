import { z } from "zod";
import { OTHER_TOPIC_REF } from "#src/constants.ts";
import { taxonomyTopicIdSchema } from "#src/pedagogy/taxonomy/schemas.ts";

export const topicRefSchema = z.union([taxonomyTopicIdSchema, z.literal(OTHER_TOPIC_REF)]);
export type TopicRef = z.infer<typeof topicRefSchema>;

export const practiceQuestionIdList = [
  "p1",
  "p2",
  "p3",
  "p4",
  "p5",
  "p6",
  "p7",
  "p8",
  "p9",
  "p10",
] as const;
export const mockQuestionIdList = [
  "m1",
  "m2",
  "m3",
  "m4",
  "m5",
  "m6",
  "m7",
  "m8",
  "m9",
  "m10",
] as const;
export const questionIdList = [...practiceQuestionIdList, ...mockQuestionIdList] as const;
export const questionIdSchema = z.enum(questionIdList);
export type QuestionId = z.infer<typeof questionIdSchema>;
export const practiceQuestionIdSchema = z.enum(practiceQuestionIdList);
export const mockQuestionIdSchema = z.enum(mockQuestionIdList);

export const workedExampleIdList = ["e1", "e2"] as const;
export const workedExampleIdSchema = z.enum(workedExampleIdList);
export type WorkedExampleId = z.infer<typeof workedExampleIdSchema>;

export const baseTextIdList = ["t1", "t2", "t3"] as const;
export const baseTextIdSchema = z.enum(baseTextIdList);
export type BaseTextId = z.infer<typeof baseTextIdSchema>;

export const kitItemIdList = [
  ...questionIdList,
  ...workedExampleIdList,
  ...baseTextIdList,
] as const;
export const kitItemIdSchema = z.enum(kitItemIdList);
export type KitItemId = z.infer<typeof kitItemIdSchema>;

export const reviewedItemIdList = [...questionIdList, ...workedExampleIdList] as const;
export const reviewedItemIdSchema = z.enum(reviewedItemIdList);
export type ReviewedItemId = z.infer<typeof reviewedItemIdSchema>;

export const optionLabelList = ["A", "B", "C", "D"] as const;
export const optionLabelSchema = z.enum(optionLabelList);
export type OptionLabel = z.infer<typeof optionLabelSchema>;

export function kitTextSchema(minLength: number, maxLength: number) {
  return z.string().trim().min(minLength).max(maxLength);
}

export function kitTextListSchema(
  minCount: number,
  maxCount: number,
  minLength: number,
  maxLength: number,
) {
  return z.array(kitTextSchema(minLength, maxLength)).min(minCount).max(maxCount);
}

export const KIT_TABLE_CELL_MAX_LENGTH = 40;
const kitTableCellSchema = z.string().trim().min(1).max(KIT_TABLE_CELL_MAX_LENGTH);

export const kitTableSchema = z
  .strictObject({
    headerList: z.array(kitTableCellSchema).min(2).max(6),
    rowList: z.array(z.array(kitTableCellSchema)).min(1).max(10),
  })
  .refine((table) => table.rowList.every((row) => row.length === table.headerList.length), {
    message: "every row must have one cell per header",
    path: ["rowList"],
  });
export type KitTable = z.infer<typeof kitTableSchema>;

export const generationVersionSchema = z
  .string()
  .regex(/^extract-v\d+\+plan-v\d+\+generate-v\d+\+review-v\d+$/);

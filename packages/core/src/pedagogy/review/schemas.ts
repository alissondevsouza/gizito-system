import { z } from "zod";
import { MAX_REVIEW_NOTE_LENGTH } from "#src/constants.ts";
import {
  baseTextIdSchema,
  reviewedItemIdList,
  reviewedItemIdSchema,
  topicRefSchema,
} from "#src/pedagogy/kit-item.ts";
import {
  itemReviewCodeSchema,
  type KitReviewCode,
  kitReviewCodeSchema,
} from "#src/pedagogy/validation/issue.ts";

export const MAX_REVIEW_ISSUE_PER_ITEM = 5;
export const MAX_REVIEW_KIT_ISSUE_COUNT = 10;

const reviewNoteSchema = z.string().trim().min(5).max(MAX_REVIEW_NOTE_LENGTH);

export const itemReviewSchema = z.strictObject({
  itemId: reviewedItemIdSchema,
  independentAnswer: z.string().trim().min(1).max(MAX_REVIEW_NOTE_LENGTH),
  issueList: z
    .array(z.strictObject({ code: itemReviewCodeSchema, note: reviewNoteSchema }))
    .max(MAX_REVIEW_ISSUE_PER_ITEM),
});
export type ItemReview = z.infer<typeof itemReviewSchema>;

export const targetedKitReviewCodeList: readonly KitReviewCode[] = [
  "section_incorrect",
  "base_text_inappropriate",
];

export const kitReviewIssueSchema = z
  .strictObject({
    code: kitReviewCodeSchema,
    targetId: z.union([topicRefSchema, baseTextIdSchema]).nullable(),
    note: reviewNoteSchema,
  })
  .refine((issue) => !targetedKitReviewCodeList.includes(issue.code) || issue.targetId !== null, {
    message: "section_incorrect and base_text_inappropriate need a targetId",
    path: ["targetId"],
  });
export type KitReviewIssue = z.infer<typeof kitReviewIssueSchema>;

export const reviewResultSchema = z.strictObject({
  itemReviewList: z.array(itemReviewSchema).max(reviewedItemIdList.length),
  kitIssueList: z.array(kitReviewIssueSchema).max(MAX_REVIEW_KIT_ISSUE_COUNT),
});
export type ReviewResult = z.infer<typeof reviewResultSchema>;

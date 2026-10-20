import { listStudyQuestion } from "#src/pedagogy/kit/answer-key.ts";
import type { StudyKit, StudyQuestion } from "#src/pedagogy/kit/schemas.ts";
import {
  type OptionLabel,
  optionLabelList,
  type ReviewedItemId,
  reviewedItemIdList,
} from "#src/pedagogy/kit-item.ts";
import {
  type KitReviewIssue,
  reviewResultSchema,
  targetedKitReviewCodeList,
} from "#src/pedagogy/review/schemas.ts";
import { normalizeKeywordText } from "#src/pedagogy/taxonomy/unsupported.ts";
import {
  createValidationIssue,
  type ItemReviewCode,
  type KitReviewCode,
  type ValidationIssue,
  type ValidationIssueCode,
} from "#src/pedagogy/validation/issue.ts";
import { err, ok, type Result } from "#src/result.ts";

export const fullReviewItemIdList: readonly ReviewedItemId[] = reviewedItemIdList;

export type ReviewOutputInvalid = { readonly code: "review_output_invalid" };

export type InterpretReviewInput = {
  readonly studyKit: StudyKit;
  readonly reviewedItemIdList: readonly ReviewedItemId[];
};

const reviewOutputInvalid: ReviewOutputInvalid = { code: "review_output_invalid" };

export function normalizeAnswerLetter(answer: string): OptionLabel | null {
  const match = /^(?:(?:letra|alternativa|opcao) )?([a-d])$/.exec(normalizeKeywordText(answer));
  const letter = match?.[1];
  return optionLabelList.find((label) => label.toLowerCase() === letter) ?? null;
}

function itemReviewIssueCodeOf(code: ItemReviewCode): ValidationIssueCode {
  return `review_${code}`;
}

function kitReviewIssueCodeOf(code: KitReviewCode): ValidationIssueCode {
  return `review_kit_${code}`;
}

function isKnownTarget(studyKit: StudyKit, issue: KitReviewIssue): boolean {
  if (issue.code === "section_incorrect") {
    return studyKit.reviewSectionList.some((section) => section.topicRef === issue.targetId);
  }
  return studyKit.baseTextList.some((baseText) => baseText.baseTextId === issue.targetId);
}

export function interpretReview(
  output: unknown,
  { studyKit, reviewedItemIdList: expectedItemIdList }: InterpretReviewInput,
): Result<readonly ValidationIssue[], ReviewOutputInvalid> {
  const parsed = reviewResultSchema.safeParse(output);
  if (!parsed.success) return err(reviewOutputInvalid);
  const { itemReviewList, kitIssueList } = parsed.data;
  const isExpectedItemList =
    itemReviewList.length === expectedItemIdList.length &&
    itemReviewList.every((review, index) => review.itemId === expectedItemIdList[index]);
  if (!isExpectedItemList) return err(reviewOutputInvalid);

  const questionById = new Map<string, StudyQuestion>(
    listStudyQuestion(studyKit).map((question) => [question.questionId, question]),
  );
  const issueList: ValidationIssue[] = [];
  for (const review of itemReviewList) {
    const question = questionById.get(review.itemId);
    if (question !== undefined && question.optionList !== null) {
      const letter = normalizeAnswerLetter(review.independentAnswer);
      if (letter === null) return err(reviewOutputInvalid);
      if (letter !== question.answer.correctOptionLabel) {
        issueList.push(createValidationIssue("review_answer_mismatch", { itemId: review.itemId }));
      }
    }
    for (const issue of review.issueList) {
      issueList.push(
        createValidationIssue(itemReviewIssueCodeOf(issue.code), {
          itemId: review.itemId,
          note: issue.note,
        }),
      );
    }
  }
  for (const issue of kitIssueList) {
    const isTargeted = targetedKitReviewCodeList.includes(issue.code);
    if (isTargeted && !isKnownTarget(studyKit, issue)) return err(reviewOutputInvalid);
    issueList.push(
      createValidationIssue(kitReviewIssueCodeOf(issue.code), {
        itemId: isTargeted ? issue.targetId : null,
        note: issue.note,
      }),
    );
  }
  return ok(issueList);
}

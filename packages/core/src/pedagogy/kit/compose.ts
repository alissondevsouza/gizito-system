import { z } from "zod";
import { OTHER_TOPIC_REF, STUDY_KIT_FORMAT_VERSION } from "#src/constants.ts";
import {
  type Grade,
  gradeSchema,
  type PerceivedDifficulty,
  perceivedDifficultySchema,
  type QuestionType,
  type Subject,
  subjectSchema,
} from "#src/enums.ts";
import {
  type MaterialProfile,
  materialProfileSchema,
  type SourceWarningCode,
  sourceWarningCodeSchema,
} from "#src/pedagogy/extraction/schemas.ts";
import {
  kitContentSchemaBySubject,
  kitRepairSchemaBySubject,
  type StudyKit,
  studyKitSchema,
} from "#src/pedagogy/kit/schemas.ts";
import {
  type BaseTextId,
  baseTextIdList,
  generationVersionSchema,
  type KitItemId,
  type QuestionId,
  questionIdList,
  type TopicRef,
  workedExampleIdList,
} from "#src/pedagogy/kit-item.ts";
import type { KitPlan, SlotDetail } from "#src/pedagogy/plan/schemas.ts";
import type { KitSlotPlan, QuestionSlot } from "#src/pedagogy/slots.ts";
import { findTopic, TAXONOMY_VERSION } from "#src/pedagogy/taxonomy/index.ts";
import { uniqueListSchema } from "#src/pedagogy/taxonomy/schemas.ts";
import { createValidationIssue, type ValidationIssue } from "#src/pedagogy/validation/issue.ts";
import { err, ok, type Result } from "#src/result.ts";

export class InvalidComposeInputError extends Error {
  override readonly name = "InvalidComposeInputError";
  constructor(readonly fieldList: readonly string[]) {
    super(`composeStudyKit received invalid order data: ${fieldList.join(", ")}`);
  }
}

const composeOrderDataSchema = z.strictObject({
  grade: gradeSchema,
  subject: subjectSchema,
  perceivedDifficulty: perceivedDifficultySchema.nullable(),
  materialProfile: materialProfileSchema,
  sourceWarningCodeList: uniqueListSchema(sourceWarningCodeSchema),
  generationVersion: generationVersionSchema,
});

function assertOrderData(input: ComposeStudyKitInput): void {
  const parsed = composeOrderDataSchema.safeParse({
    grade: input.grade,
    subject: input.subject,
    perceivedDifficulty: input.perceivedDifficulty,
    materialProfile: input.materialProfile,
    sourceWarningCodeList: input.sourceWarningCodeList,
    generationVersion: input.generationVersion,
  });
  if (!parsed.success) {
    throw new InvalidComposeInputError(parsed.error.issues.map((issue) => issue.path.join(".")));
  }
}

export type ComposeStudyKitInput = {
  readonly content: unknown;
  readonly kitSlotPlan: KitSlotPlan;
  readonly plan: KitPlan;
  readonly grade: Grade;
  readonly subject: Subject;
  readonly perceivedDifficulty: PerceivedDifficulty | null;
  readonly materialProfile: MaterialProfile;
  readonly sourceWarningCodeList: readonly SourceWarningCode[];
  readonly generationVersion: string;
};

type QuestionContent = {
  readonly questionId: QuestionId;
  readonly optionList: readonly unknown[] | null;
  readonly answer: { readonly evidenceQuote: string | null };
};

type QuestionShape = {
  readonly questionType: QuestionType;
  readonly baseTextId: BaseTextId | null;
};

function slotMismatch(itemId: KitItemId | TopicRef | null = null): ValidationIssue {
  return createValidationIssue("kit_slot_mismatch", { itemId });
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function checkQuestionShape(question: QuestionContent, shape: QuestionShape): ValidationIssue[] {
  const hasOptionList = question.optionList !== null;
  const hasEvidenceQuote = question.answer.evidenceQuote !== null;
  const isCoherent =
    hasOptionList === (shape.questionType === "multiple_choice") &&
    hasEvidenceQuote === (shape.baseTextId !== null);
  return isCoherent ? [] : [slotMismatch(question.questionId)];
}

function topicLabelOf(topicRef: TopicRef, plan: KitPlan): string | null {
  if (topicRef === OTHER_TOPIC_REF) return plan.otherTopicAssessment?.label ?? null;
  return findTopic(topicRef)?.label ?? null;
}

function toStudyQuestion<T extends QuestionContent>(
  question: T,
  slot: QuestionSlot,
  detail: SlotDetail,
  number: number,
) {
  return {
    ...question,
    block: slot.block,
    number,
    topicRef: slot.topicRef,
    difficulty: slot.difficulty,
    questionType: detail.questionType,
    isContextualized: detail.isContextualized,
    skillFocus: detail.skillFocus,
    baseTextId: detail.baseTextId,
  };
}

function finishStudyKit(candidate: unknown): Result<StudyKit, readonly ValidationIssue[]> {
  const parsed = studyKitSchema.safeParse(candidate);
  return parsed.success ? ok(parsed.data) : err([slotMismatch()]);
}

export function composeStudyKit(
  input: ComposeStudyKitInput,
): Result<StudyKit, readonly ValidationIssue[]> {
  assertOrderData(input);
  const parsed = kitContentSchemaBySubject[input.subject].safeParse(input.content);
  if (!parsed.success) return err([createValidationIssue("kit_output_invalid")]);
  const content = parsed.data;
  const { kitSlotPlan, plan } = input;
  const detailById = new Map(plan.slotDetailList.map((detail) => [detail.slotId, detail]));
  const slotList = [...kitSlotPlan.practiceSlotList, ...kitSlotPlan.mockSlotList];
  const questionList = [...content.practiceQuestionList, ...content.mockQuestionList];
  const topicLabelList = kitSlotPlan.reviewSectionTopicRefList.map((topicRef) => ({
    topicRef,
    label: topicLabelOf(topicRef, plan),
  }));

  const isStructureMatch =
    sameList(
      questionList.map((question) => question.questionId),
      slotList.map((slot) => slot.slotId),
    ) &&
    sameList(
      questionList.map((question) => question.questionId),
      plan.slotDetailList.map((detail) => detail.slotId),
    ) &&
    sameList(
      content.workedExampleList.map((example) => example.exampleId),
      kitSlotPlan.workedExampleSlotList.map((slot) => slot.exampleId),
    ) &&
    sameList(
      content.reviewSectionList.map((section) => section.topicRef),
      kitSlotPlan.reviewSectionTopicRefList,
    ) &&
    sameList(
      content.baseTextList.map((baseText) => baseText.baseTextId),
      plan.baseTextBriefList.map((brief) => brief.baseTextId),
    );
  if (!isStructureMatch) return err([slotMismatch()]);

  const shapeIssueList = [
    ...questionList.flatMap((question) => {
      const detail = detailById.get(question.questionId);
      return detail === undefined
        ? [slotMismatch(question.questionId)]
        : checkQuestionShape(question, detail);
    }),
    ...topicLabelList.flatMap((topic) =>
      topic.label === null ? [slotMismatch(topic.topicRef)] : [],
    ),
  ];
  if (shapeIssueList.length > 0) return err(shapeIssueList);

  const blockOfBaseText = new Map(
    plan.baseTextBriefList.map((brief) => [brief.baseTextId, brief.block]),
  );
  const studyQuestionList = questionList.flatMap((question, index) => {
    const slot = slotList[index];
    const detail = detailById.get(question.questionId);
    if (slot === undefined || detail === undefined) return [];
    const blockSlotList =
      slot.block === "practice" ? kitSlotPlan.practiceSlotList : kitSlotPlan.mockSlotList;
    return [toStudyQuestion(question, slot, detail, blockSlotList.indexOf(slot) + 1)];
  });

  return finishStudyKit({
    formatVersion: STUDY_KIT_FORMAT_VERSION,
    subject: input.subject,
    grade: input.grade,
    perceivedDifficulty: input.perceivedDifficulty,
    taxonomyVersion: TAXONOMY_VERSION,
    generationVersion: input.generationVersion,
    topicList: topicLabelList,
    materialProfile: input.materialProfile,
    sourceWarningCodeList: input.sourceWarningCodeList,
    reviewSectionList: content.reviewSectionList,
    baseTextList: content.baseTextList.map((baseText) => ({
      ...baseText,
      block: blockOfBaseText.get(baseText.baseTextId),
    })),
    workedExampleList: content.workedExampleList.map((example, index) => ({
      ...example,
      topicRef: kitSlotPlan.workedExampleSlotList[index]?.topicRef,
    })),
    practiceQuestionList: studyQuestionList.filter((question) => question.block === "practice"),
    mockQuestionList: studyQuestionList.filter((question) => question.block === "mock"),
    mockSuggestedMinutes: content.mockSuggestedMinutes,
    studyTip: content.studyTip,
    qualityCheckList: [],
  });
}

function requestedInKitOrder<T extends string>(
  kitOrder: readonly T[],
  itemIdList: readonly (KitItemId | TopicRef)[],
): readonly T[] {
  return kitOrder.filter((id) => itemIdList.includes(id));
}

type Keyed<K extends string> = { readonly [key in K]: string };

function replaceById<K extends string>(
  currentList: readonly Keyed<K>[],
  replacementList: readonly Keyed<K>[],
  key: K,
): unknown[] {
  return currentList.map((current) => {
    const replacement = replacementList.find((item) => item[key] === current[key]);
    return replacement === undefined ? current : { ...current, ...replacement };
  });
}

export function applyKitRepair(
  studyKit: StudyKit,
  output: unknown,
  itemIdList: readonly (KitItemId | TopicRef)[],
): Result<StudyKit, readonly ValidationIssue[]> {
  const parsed = kitRepairSchemaBySubject[studyKit.subject].safeParse(output);
  if (!parsed.success) return err([createValidationIssue("kit_output_invalid")]);
  const repair = parsed.data;
  const questionList = [...studyKit.practiceQuestionList, ...studyKit.mockQuestionList];
  const repairQuestionList = [...repair.practiceQuestionList, ...repair.mockQuestionList];

  const isRequestMatch =
    sameList(
      repairQuestionList.map((question) => question.questionId),
      requestedInKitOrder(questionIdList, itemIdList),
    ) &&
    sameList(
      repair.workedExampleList.map((example) => example.exampleId),
      requestedInKitOrder(workedExampleIdList, itemIdList),
    ) &&
    sameList(
      repair.reviewSectionList.map((section) => section.topicRef),
      requestedInKitOrder(
        studyKit.reviewSectionList.map((section) => section.topicRef),
        itemIdList,
      ),
    ) &&
    sameList(
      repair.baseTextList.map((baseText) => baseText.baseTextId),
      requestedInKitOrder(
        baseTextIdList.filter((id) => studyKit.baseTextList.some((text) => text.baseTextId === id)),
        itemIdList,
      ),
    );
  if (!isRequestMatch) return err([slotMismatch()]);

  const shapeIssueList = [
    ...repairQuestionList.flatMap((question) => {
      const current = questionList.find((item) => item.questionId === question.questionId);
      return current === undefined
        ? [slotMismatch(question.questionId)]
        : checkQuestionShape(question, current);
    }),
  ];
  if (shapeIssueList.length > 0) return err(shapeIssueList);

  return finishStudyKit({
    ...studyKit,
    reviewSectionList: replaceById(
      studyKit.reviewSectionList,
      repair.reviewSectionList,
      "topicRef",
    ),
    baseTextList: replaceById(studyKit.baseTextList, repair.baseTextList, "baseTextId"),
    workedExampleList: replaceById(
      studyKit.workedExampleList,
      repair.workedExampleList,
      "exampleId",
    ),
    practiceQuestionList: replaceById(
      studyKit.practiceQuestionList,
      repair.practiceQuestionList,
      "questionId",
    ),
    mockQuestionList: replaceById(studyKit.mockQuestionList, repair.mockQuestionList, "questionId"),
    qualityCheckList: [],
  });
}

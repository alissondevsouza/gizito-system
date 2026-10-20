import {
  MAX_MOCK_BASE_TEXT_COUNT,
  MAX_MULTIPLE_CHOICE_PER_BLOCK,
  MAX_PRACTICE_BASE_TEXT_COUNT,
  MIN_CONTEXTUALIZED_MATH_MOCK_COUNT,
  MIN_MOCK_BASE_TEXT_COUNT,
  MIN_MULTIPLE_CHOICE_PER_BLOCK,
  OTHER_TOPIC_REF,
} from "#src/constants.ts";
import { type QuestionBlock, questionBlockList, type Subject } from "#src/enums.ts";
import { questionBlockOf, workedExampleIdList } from "#src/pedagogy/kit-item.ts";
import { type KitPlan, kitPlanSchema, type SlotDetail } from "#src/pedagogy/plan/schemas.ts";
import type { KitSlotPlan } from "#src/pedagogy/slots.ts";
import { createValidationIssue, type ValidationIssue } from "#src/pedagogy/validation/issue.ts";
import { err, ok, type Result } from "#src/result.ts";

type PlanContext = {
  readonly plan: KitPlan;
  readonly kitSlotPlan: KitSlotPlan;
  readonly subject: Subject;
};

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function slotDetailListOf(plan: KitPlan, block: QuestionBlock): readonly SlotDetail[] {
  return plan.slotDetailList.filter((detail) => questionBlockOf(detail.slotId) === block);
}

function checkOtherTopicAssessment({ plan, kitSlotPlan }: PlanContext): ValidationIssue[] {
  const hasOtherTopic = kitSlotPlan.reviewSectionTopicRefList.includes(OTHER_TOPIC_REF);
  return hasOtherTopic === (plan.otherTopicAssessment !== null)
    ? []
    : [createValidationIssue("plan_output_invalid", { itemId: OTHER_TOPIC_REF })];
}

function checkSlotMatch({ plan, kitSlotPlan }: PlanContext): ValidationIssue[] {
  const slotIdList = [...kitSlotPlan.practiceSlotList, ...kitSlotPlan.mockSlotList].map(
    (slot) => slot.slotId,
  );
  const isMatch =
    sameList(
      plan.slotDetailList.map((detail) => detail.slotId),
      slotIdList,
    ) &&
    sameList(
      plan.topicObjectiveList.map((objective) => objective.topicRef),
      kitSlotPlan.reviewSectionTopicRefList,
    ) &&
    sameList(
      plan.workedExampleFocusList.map((focus) => focus.exampleId),
      workedExampleIdList,
    );
  return isMatch ? [] : [createValidationIssue("plan_slot_mismatch")];
}

function checkMultipleChoiceMix({ plan }: PlanContext): ValidationIssue[] {
  return questionBlockList.flatMap((block) => {
    const count = slotDetailListOf(plan, block).filter(
      (detail) => detail.questionType === "multiple_choice",
    ).length;
    return count >= MIN_MULTIPLE_CHOICE_PER_BLOCK && count <= MAX_MULTIPLE_CHOICE_PER_BLOCK
      ? []
      : [createValidationIssue("plan_multiple_choice_mix")];
  });
}

function checkContextualizedMajority({ plan, subject }: PlanContext): ValidationIssue[] {
  if (subject !== "math") return [];
  const count = slotDetailListOf(plan, "mock").filter((detail) => detail.isContextualized).length;
  return count >= MIN_CONTEXTUALIZED_MATH_MOCK_COUNT
    ? []
    : [createValidationIssue("plan_contextualized_minority")];
}

function hasValidBaseTextPlan(plan: KitPlan, subject: Subject): boolean {
  if (subject === "math") {
    return (
      plan.baseTextBriefList.length === 0 &&
      plan.slotDetailList.every((detail) => detail.baseTextId === null)
    );
  }
  const blockOfBaseText = new Map(
    plan.baseTextBriefList.map((brief) => [brief.baseTextId, brief.block]),
  );
  const briefCountOf = (block: QuestionBlock) =>
    plan.baseTextBriefList.filter((brief) => brief.block === block).length;
  const mockBriefCount = briefCountOf("mock");
  return (
    mockBriefCount >= MIN_MOCK_BASE_TEXT_COUNT &&
    mockBriefCount <= MAX_MOCK_BASE_TEXT_COUNT &&
    briefCountOf("practice") <= MAX_PRACTICE_BASE_TEXT_COUNT &&
    slotDetailListOf(plan, "mock").every((detail) => detail.baseTextId !== null) &&
    questionBlockList.every((block) =>
      slotDetailListOf(plan, block).every(
        (detail) => detail.baseTextId === null || blockOfBaseText.get(detail.baseTextId) === block,
      ),
    )
  );
}

function checkBaseTextPlan({ plan, subject }: PlanContext): ValidationIssue[] {
  return hasValidBaseTextPlan(plan, subject)
    ? []
    : [createValidationIssue("plan_base_text_invalid")];
}

function checkOtherTopicFeasibility({ plan }: PlanContext): ValidationIssue[] {
  return plan.otherTopicAssessment?.verdict === "unfeasible"
    ? [createValidationIssue("other_topic_unfeasible", { itemId: OTHER_TOPIC_REF })]
    : [];
}

const planRuleList: readonly ((context: PlanContext) => ValidationIssue[])[] = [
  checkOtherTopicAssessment,
  checkSlotMatch,
  checkMultipleChoiceMix,
  checkContextualizedMajority,
  checkBaseTextPlan,
  checkOtherTopicFeasibility,
];

export function validateKitPlan(
  output: unknown,
  kitSlotPlan: KitSlotPlan,
  subject: Subject,
): Result<KitPlan, readonly ValidationIssue[]> {
  const parsed = kitPlanSchema.safeParse(output);
  if (!parsed.success) return err([createValidationIssue("plan_output_invalid")]);
  const context = { plan: parsed.data, kitSlotPlan, subject };
  const issueList = planRuleList.flatMap((rule) => rule(context));
  return issueList.length === 0 ? ok(parsed.data) : err(issueList);
}

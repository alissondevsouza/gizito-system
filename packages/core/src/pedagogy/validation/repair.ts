import { MAX_REPAIR_ITEM_COUNT } from "#src/constants.ts";
import { listStudyQuestion } from "#src/pedagogy/kit/answer-key.ts";
import type { StudyKit } from "#src/pedagogy/kit/schemas.ts";
import type { KitItemId, TopicRef } from "#src/pedagogy/kit-item.ts";
import {
  type ValidationIssue,
  type ValidationRepair,
  validationIssueRuleMap,
} from "#src/pedagogy/validation/issue.ts";

export type RepairFailReasonCode = "other_topic_unfeasible" | "generation_blocked";

export type RepairItemId = KitItemId | TopicRef;

export type RepairDecision =
  | { readonly repair: "none"; readonly failReasonCode: RepairFailReasonCode }
  | { readonly repair: "plan" }
  | { readonly repair: "kit" }
  | {
      readonly repair: "item";
      readonly itemIdList: readonly RepairItemId[];
      readonly issueList: readonly ValidationIssue[];
    };

function repairOf(issue: ValidationIssue): ValidationRepair | null {
  return issue.severity === "blocker" ? validationIssueRuleMap[issue.code].repair : null;
}

function kitItemOrder(studyKit: StudyKit): readonly RepairItemId[] {
  return [
    ...studyKit.reviewSectionList.map((section) => section.topicRef),
    ...studyKit.baseTextList.map((baseText) => baseText.baseTextId),
    ...studyKit.workedExampleList.map((example) => example.exampleId),
    ...listStudyQuestion(studyKit).map((question) => question.questionId),
  ];
}

function expandItemIdList(
  itemIdSet: ReadonlySet<RepairItemId>,
  studyKit: StudyKit,
): readonly RepairItemId[] {
  const expandedSet = new Set(itemIdSet);
  for (const question of listStudyQuestion(studyKit)) {
    if (question.baseTextId !== null && itemIdSet.has(question.baseTextId)) {
      expandedSet.add(question.questionId);
    }
  }
  return kitItemOrder(studyKit).filter((itemId) => expandedSet.has(itemId));
}

export function decideRepair(
  issueList: readonly ValidationIssue[],
  studyKit: StudyKit | null,
): RepairDecision | null {
  const blockerList = issueList.filter((issue) => repairOf(issue) !== null);
  if (blockerList.length === 0) return null;
  const repairSet = new Set(blockerList.map(repairOf));
  if (repairSet.has("none")) {
    const isOtherTopicUnfeasible = blockerList.some(
      (issue) => issue.code === "other_topic_unfeasible",
    );
    return {
      repair: "none",
      failReasonCode: isOtherTopicUnfeasible ? "other_topic_unfeasible" : "generation_blocked",
    };
  }
  const itemIssueList = blockerList.filter((issue) => repairOf(issue) === "item");
  if (repairSet.has("plan") || itemIssueList.some((issue) => issue.itemId === null)) {
    return { repair: "plan" };
  }
  if (repairSet.has("kit") || studyKit === null) return { repair: "kit" };
  const itemIdList = expandItemIdList(
    new Set(itemIssueList.flatMap((issue) => (issue.itemId === null ? [] : [issue.itemId]))),
    studyKit,
  );
  return itemIdList.length > MAX_REPAIR_ITEM_COUNT
    ? { repair: "kit" }
    : { repair: "item", itemIdList, issueList: itemIssueList };
}

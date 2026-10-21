import {
  difficultyLabelMap,
  findTopic,
  type KitPlan,
  type KitSlotPlan,
  type MaterialProfile,
  OTHER_TOPIC_REF,
  type PerceivedDifficulty,
  perceivedDifficultyLabelMap,
  questionBlockLabelMap,
  questionTypeLabelMap,
  type TopicRef,
  topicValidationRuleDescriptionMap,
} from "@gizito/core";
import { toPromptJson, toPromptText } from "#src/pipeline/prompts/template.ts";

export const OTHER_TOPIC_PLAN_REFERENCE = "ver <assunto_outro>";

const WORKED_EXAMPLE_LABEL = "exemplo";
const EMPTY_PREREQUISITE_TEXT = "nenhum";
const EMPTY_RULE_TEXT = "nenhuma";

export class UnknownTopicRefError extends Error {
  constructor(readonly topicRef: string) {
    super(`assunto fora da taxonomia: ${topicRef}`);
    this.name = "UnknownTopicRefError";
  }
}

function topicLineOf(topicRef: TopicRef, otherTopicText: string): string {
  if (topicRef === OTHER_TOPIC_REF) return `${OTHER_TOPIC_REF} | ${otherTopicText}`;
  const topic = findTopic(topicRef);
  if (topic === undefined) throw new UnknownTopicRefError(topicRef);
  const prerequisiteLabelList = topic.prerequisiteList.map(
    (topicId) => findTopic(topicId)?.label ?? topicId,
  );
  const ruleDescriptionList = topic.validationRuleList.map(
    (rule) => topicValidationRuleDescriptionMap[rule],
  );
  return [
    topic.topicId,
    topic.label,
    topic.description,
    `BNCC: ${topic.bnccSkillList.join(", ")}`,
    `pré-requisitos: ${prerequisiteLabelList.join(", ") || EMPTY_PREREQUISITE_TEXT}`,
    `regras: ${ruleDescriptionList.join(" ") || EMPTY_RULE_TEXT}`,
  ].join(" | ");
}

export function buildTopicBlock(topicRefList: readonly TopicRef[], otherTopicText: string): string {
  return topicRefList.map((topicRef) => topicLineOf(topicRef, otherTopicText)).join("\n");
}

export function otherTopicLabelText(plan: KitPlan): string {
  return toPromptText(plan.otherTopicAssessment?.label ?? "");
}

export function buildPlanSlotTable(kitSlotPlan: KitSlotPlan): string {
  return [
    ...[...kitSlotPlan.practiceSlotList, ...kitSlotPlan.mockSlotList].map((slot) =>
      [
        slot.slotId,
        questionBlockLabelMap[slot.block],
        slot.topicRef,
        difficultyLabelMap[slot.difficulty],
      ].join(" | "),
    ),
    ...kitSlotPlan.workedExampleSlotList.map((slot) =>
      [slot.exampleId, WORKED_EXAMPLE_LABEL, slot.topicRef].join(" | "),
    ),
  ].join("\n");
}

export function buildKitSlotTable(kitSlotPlan: KitSlotPlan, plan: KitPlan): string {
  const detailById = new Map(plan.slotDetailList.map((detail) => [detail.slotId, detail]));
  const focusById = new Map(
    plan.workedExampleFocusList.map((focus) => [focus.exampleId, focus.focus]),
  );
  return [
    ...[...kitSlotPlan.practiceSlotList, ...kitSlotPlan.mockSlotList].map((slot) => {
      const detail = detailById.get(slot.slotId);
      const planColumnList =
        detail === undefined
          ? []
          : [
              questionTypeLabelMap[detail.questionType],
              detail.isContextualized ? "contextualizada" : "não contextualizada",
              toPromptText(detail.skillFocus),
              detail.baseTextId === null ? "sem texto-base" : `texto-base ${detail.baseTextId}`,
            ];
      return [
        slot.slotId,
        questionBlockLabelMap[slot.block],
        slot.topicRef,
        difficultyLabelMap[slot.difficulty],
        ...planColumnList,
      ].join(" | ");
    }),
    ...kitSlotPlan.workedExampleSlotList.map((slot) =>
      [
        slot.exampleId,
        WORKED_EXAMPLE_LABEL,
        slot.topicRef,
        toPromptText(focusById.get(slot.exampleId) ?? ""),
      ].join(" | "),
    ),
  ].join("\n");
}

export function buildMaterialProfileJson(profile: MaterialProfile): string {
  return toPromptJson({
    ...profile,
    terminologyList: profile.terminologyList.map(toPromptText),
    contextThemeList: profile.contextThemeList.map(toPromptText),
  });
}

export function perceivedDifficultyLabelOf(
  perceivedDifficulty: PerceivedDifficulty | null,
): string {
  return perceivedDifficultyLabelMap[perceivedDifficulty ?? "unknown"];
}

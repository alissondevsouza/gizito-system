import { z } from "zod";
import { gradeList } from "#src/enums.ts";
import { isBnccSkillOfGrade } from "#src/pedagogy/taxonomy/bncc.ts";
import {
  type Topic,
  topicIdPrefixOf,
  topicValidationRuleSubjectMap,
} from "#src/pedagogy/taxonomy/schemas.ts";

export const taxonomyIssueCodeList = [
  "duplicate_topic_id",
  "duplicate_topic_label",
  "topic_id_prefix_mismatch",
  "missing_prerequisite",
  "self_prerequisite",
  "prerequisite_subject_mismatch",
  "prerequisite_from_later_grade",
  "deprecated_prerequisite",
  "prerequisite_cycle",
  "bncc_skill_out_of_grade",
  "validation_rule_subject_mismatch",
] as const;
export const taxonomyIssueCodeSchema = z.enum(taxonomyIssueCodeList);
export type TaxonomyIssueCode = z.infer<typeof taxonomyIssueCodeSchema>;

export type TaxonomyIssue = {
  readonly code: TaxonomyIssueCode;
  readonly topicId: string;
  readonly detail: string;
};

function sectionKeyOf(topic: Topic): string {
  return `${topic.grade}-${topic.subject}`;
}

function listDuplicateIssues(topicList: readonly Topic[]): TaxonomyIssue[] {
  const seenTopicIdSet = new Set<string>();
  const seenLabelSet = new Set<string>();
  const issueList: TaxonomyIssue[] = [];
  for (const topic of topicList) {
    if (seenTopicIdSet.has(topic.topicId)) {
      issueList.push({ code: "duplicate_topic_id", topicId: topic.topicId, detail: topic.topicId });
    }
    seenTopicIdSet.add(topic.topicId);
    const labelKey = `${sectionKeyOf(topic)}:${topic.label.trim().toLocaleLowerCase("pt-BR")}`;
    if (seenLabelSet.has(labelKey)) {
      issueList.push({
        code: "duplicate_topic_label",
        topicId: topic.topicId,
        detail: topic.label,
      });
    }
    seenLabelSet.add(labelKey);
  }
  return issueList;
}

function listTopicIssues(topic: Topic, topicById: ReadonlyMap<string, Topic>): TaxonomyIssue[] {
  const issueList: TaxonomyIssue[] = [];
  const push = (code: TaxonomyIssueCode, detail: string) => {
    issueList.push({ code, topicId: topic.topicId, detail });
  };
  if (!topic.topicId.startsWith(topicIdPrefixOf(topic.grade, topic.subject))) {
    push("topic_id_prefix_mismatch", topicIdPrefixOf(topic.grade, topic.subject));
  }
  for (const code of topic.bnccSkillList) {
    if (!isBnccSkillOfGrade(code, topic.grade, topic.subject))
      push("bncc_skill_out_of_grade", code);
  }
  for (const rule of topic.validationRuleList) {
    if (topicValidationRuleSubjectMap[rule] !== topic.subject) {
      push("validation_rule_subject_mismatch", rule);
    }
  }
  for (const prerequisiteId of topic.prerequisiteList) {
    if (prerequisiteId === topic.topicId) {
      push("self_prerequisite", prerequisiteId);
      continue;
    }
    const prerequisite = topicById.get(prerequisiteId);
    if (prerequisite === undefined) {
      push("missing_prerequisite", prerequisiteId);
      continue;
    }
    if (prerequisite.subject !== topic.subject)
      push("prerequisite_subject_mismatch", prerequisiteId);
    if (gradeList.indexOf(prerequisite.grade) > gradeList.indexOf(topic.grade)) {
      push("prerequisite_from_later_grade", prerequisiteId);
    }
    if (topic.deprecated !== true && prerequisite.deprecated === true) {
      push("deprecated_prerequisite", prerequisiteId);
    }
  }
  return issueList;
}

function reachesItself(start: Topic, topicById: ReadonlyMap<string, Topic>): boolean {
  const visitedIdSet = new Set<string>();
  const pendingIdList = start.prerequisiteList.filter((id) => id !== start.topicId);
  while (pendingIdList.length > 0) {
    const id = pendingIdList.pop();
    if (id === undefined || visitedIdSet.has(id)) continue;
    if (id === start.topicId) return true;
    visitedIdSet.add(id);
    const topic = topicById.get(id);
    if (topic !== undefined) {
      pendingIdList.push(...topic.prerequisiteList.filter((nextId) => nextId !== topic.topicId));
    }
  }
  return false;
}

export function checkTaxonomyIntegrity(topicList: readonly Topic[]): TaxonomyIssue[] {
  const topicById = new Map<string, Topic>();
  for (const topic of topicList) {
    if (!topicById.has(topic.topicId)) topicById.set(topic.topicId, topic);
  }
  const cycleIssueList: TaxonomyIssue[] = topicList
    .filter((topic) => reachesItself(topic, topicById))
    .map((topic) => ({
      code: "prerequisite_cycle",
      topicId: topic.topicId,
      detail: topic.topicId,
    }));
  return [
    ...listDuplicateIssues(topicList),
    ...topicList.flatMap((topic) => listTopicIssues(topic, topicById)),
    ...cycleIssueList,
  ];
}

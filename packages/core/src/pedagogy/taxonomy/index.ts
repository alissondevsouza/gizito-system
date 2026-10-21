import type { Grade, Subject } from "#src/enums.ts";
import { grade4MathTopicList } from "#src/pedagogy/taxonomy/4-math.ts";
import { grade4PortugueseTopicList } from "#src/pedagogy/taxonomy/4-portuguese.ts";
import { grade5MathTopicList } from "#src/pedagogy/taxonomy/5-math.ts";
import { grade5PortugueseTopicList } from "#src/pedagogy/taxonomy/5-portuguese.ts";
import { grade6MathTopicList } from "#src/pedagogy/taxonomy/6-math.ts";
import { grade6PortugueseTopicList } from "#src/pedagogy/taxonomy/6-portuguese.ts";
import { grade7MathTopicList } from "#src/pedagogy/taxonomy/7-math.ts";
import { grade7PortugueseTopicList } from "#src/pedagogy/taxonomy/7-portuguese.ts";
import { createTaxonomyLookup } from "#src/pedagogy/taxonomy/lookup.ts";
import type { Topic, TopicDefinition } from "#src/pedagogy/taxonomy/schemas.ts";

export const TAXONOMY_VERSION = "tax-v2";

type TaxonomySection = {
  readonly grade: Grade;
  readonly subject: Subject;
  readonly topicList: readonly TopicDefinition[];
};

const taxonomySectionList: readonly TaxonomySection[] = [
  { grade: "4", subject: "math", topicList: grade4MathTopicList },
  { grade: "5", subject: "math", topicList: grade5MathTopicList },
  { grade: "6", subject: "math", topicList: grade6MathTopicList },
  { grade: "7", subject: "math", topicList: grade7MathTopicList },
  { grade: "4", subject: "portuguese", topicList: grade4PortugueseTopicList },
  { grade: "5", subject: "portuguese", topicList: grade5PortugueseTopicList },
  { grade: "6", subject: "portuguese", topicList: grade6PortugueseTopicList },
  { grade: "7", subject: "portuguese", topicList: grade7PortugueseTopicList },
];

export const taxonomyTopicList: readonly Topic[] = taxonomySectionList.flatMap((section) =>
  section.topicList.map((topic) => ({ ...topic, grade: section.grade, subject: section.subject })),
);

export const { listTopics, findTopic, isSelectableTopic } = createTaxonomyLookup(taxonomyTopicList);

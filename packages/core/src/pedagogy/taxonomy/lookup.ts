import type { Grade, Subject } from "#src/enums.ts";
import type { Topic } from "#src/pedagogy/taxonomy/schemas.ts";

export type TaxonomyLookup = {
  readonly listTopics: (grade: Grade, subject: Subject) => readonly Topic[];
  readonly findTopic: (topicId: string) => Topic | undefined;
  readonly isSelectableTopic: (topicId: string, grade: Grade, subject: Subject) => boolean;
};

export function createTaxonomyLookup(topicList: readonly Topic[]): TaxonomyLookup {
  const topicById = new Map(topicList.map((topic) => [topic.topicId, topic]));
  return {
    listTopics: (grade, subject) =>
      topicList.filter(
        (topic) => topic.grade === grade && topic.subject === subject && topic.deprecated !== true,
      ),
    findTopic: (topicId) => topicById.get(topicId),
    isSelectableTopic: (topicId, grade, subject) => {
      const topic = topicById.get(topicId);
      return (
        topic !== undefined &&
        topic.grade === grade &&
        topic.subject === subject &&
        topic.deprecated !== true
      );
    },
  };
}

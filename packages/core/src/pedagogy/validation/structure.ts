import { MIN_QUESTION_COUNT_PER_TOPIC_PER_BLOCK, type TopicCount } from "#src/constants.ts";
import { difficultyList, questionBlockList } from "#src/enums.ts";
import type { StudyKit } from "#src/pedagogy/kit/schemas.ts";
import { shiftedDifficultyDistribution } from "#src/pedagogy/slots.ts";
import { createValidationIssue, type ValidationIssue } from "#src/pedagogy/validation/issue.ts";

function blockQuestionList(studyKit: StudyKit, block: (typeof questionBlockList)[number]) {
  return block === "practice" ? studyKit.practiceQuestionList : studyKit.mockQuestionList;
}

function isTopicCount(count: number): count is TopicCount {
  return count in MIN_QUESTION_COUNT_PER_TOPIC_PER_BLOCK;
}

export function checkTopicCoverage(studyKit: StudyKit): ValidationIssue[] {
  const topicCount = studyKit.topicList.length;
  if (!isTopicCount(topicCount)) return [];
  const minimum = MIN_QUESTION_COUNT_PER_TOPIC_PER_BLOCK[topicCount];
  return questionBlockList.flatMap((block) =>
    studyKit.topicList.flatMap((topic) => {
      const count = blockQuestionList(studyKit, block).filter(
        (question) => question.topicRef === topic.topicRef,
      ).length;
      return count >= minimum
        ? []
        : [createValidationIssue("topic_coverage_below_minimum", { itemId: topic.topicRef })];
    }),
  );
}

export function checkDifficultyDistribution(studyKit: StudyKit): ValidationIssue[] {
  return questionBlockList.flatMap((block) => {
    const distribution = shiftedDifficultyDistribution(block, studyKit.perceivedDifficulty);
    const questionList = blockQuestionList(studyKit, block);
    const isMatch = difficultyList.every(
      (difficulty) =>
        questionList.filter((question) => question.difficulty === difficulty).length ===
        distribution[difficulty],
    );
    return isMatch ? [] : [createValidationIssue("difficulty_distribution_mismatch")];
  });
}

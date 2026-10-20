import type { StudyKit } from "#src/pedagogy/kit/schemas.ts";
import {
  checkEvidenceQuote,
  checkExpressionNumber,
  checkFractionSimplified,
  checkNonComputableExcess,
  checkOptionList,
  checkRecalculation,
  checkUnitPresent,
} from "#src/pedagogy/validation/answers.ts";
import {
  checkBaseTextLength,
  checkDuplicateQuestion,
  checkExampleSimilarToQuestion,
  checkMockHint,
  checkSimilarQuestion,
  checkStatementLength,
  checkTextPattern,
} from "#src/pedagogy/validation/content.ts";
import type { ValidationIssue } from "#src/pedagogy/validation/issue.ts";
import type { KitValidationRule, ValidationContext } from "#src/pedagogy/validation/rule.ts";
import {
  checkDifficultyDistribution,
  checkTopicCoverage,
} from "#src/pedagogy/validation/structure.ts";

export const kitValidationRuleList: readonly KitValidationRule[] = [
  checkTopicCoverage,
  checkDifficultyDistribution,
  checkOptionList,
  checkRecalculation,
  checkEvidenceQuote,
  checkNonComputableExcess,
  checkExpressionNumber,
  checkFractionSimplified,
  checkUnitPresent,
  checkTextPattern,
  checkDuplicateQuestion,
  checkSimilarQuestion,
  checkExampleSimilarToQuestion,
  checkMockHint,
  checkStatementLength,
  checkBaseTextLength,
];

export function validateStudyKit(
  studyKit: StudyKit,
  context: ValidationContext,
): readonly ValidationIssue[] {
  return kitValidationRuleList.flatMap((rule) => rule(studyKit, context));
}

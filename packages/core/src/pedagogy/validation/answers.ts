import {
  MAX_NON_COMPUTABLE_MATH_QUESTION_COUNT,
  OTHER_TOPIC_REF,
  UNIT_CONVERSION_FACTOR_LIST,
} from "#src/constants.ts";
import type { ExpectedAnswer } from "#src/pedagogy/expected-answer.ts";
import type {
  MathOption,
  MathSolution,
  MathStudyKit,
  MathStudyQuestion,
  PortugueseStudyKit,
  StudyKit,
} from "#src/pedagogy/kit/schemas.ts";
import type { KitItemId, KitTable } from "#src/pedagogy/kit-item.ts";
import { findTopic } from "#src/pedagogy/taxonomy/index.ts";
import {
  createValidationIssue,
  type ValidationIssue,
  type ValidationIssueCode,
} from "#src/pedagogy/validation/issue.ts";
import { normalizeSpacing } from "#src/pedagogy/validation/patterns.ts";
import type { ValidationContext } from "#src/pedagogy/validation/rule.ts";

type OptionCheck<T> = {
  readonly itemId: KitItemId;
  readonly correct: T | undefined;
  readonly distractorList: readonly T[];
  readonly expected: T;
};

function checkOptionSet<T>(
  { itemId, correct, distractorList, expected }: OptionCheck<T>,
  isSame: (left: T, right: T) => boolean,
): ValidationIssue[] {
  const issueList: ValidationIssue[] = [];
  if (correct === undefined || !isSame(correct, expected)) {
    issueList.push(createValidationIssue("correct_option_mismatch", { itemId }));
  }
  if (correct !== undefined && distractorList.some((distractor) => isSame(distractor, correct))) {
    issueList.push(createValidationIssue("distractor_equivalent", { itemId }));
  }
  const hasDuplicateDistractor = distractorList.some((distractor, index) =>
    distractorList.slice(index + 1).some((other) => isSame(distractor, other)),
  );
  if (hasDuplicateDistractor) issueList.push(createValidationIssue("option_duplicate", { itemId }));
  return issueList;
}

function checkMathOptionList(studyKit: MathStudyKit, { mathEvaluator }: ValidationContext) {
  return mathQuestionList(studyKit).flatMap((question) => {
    if (question.optionList === null) return [];
    const label = question.answer.correctOptionLabel;
    return checkOptionSet(
      {
        itemId: question.questionId,
        correct: question.optionList.find((option) => option.label === label)?.value,
        distractorList: question.optionList
          .filter((option) => option.label !== label)
          .map((option) => option.value),
        expected: question.answer.expectedAnswer,
      },
      (left, right) => mathEvaluator.equals(left, right),
    );
  });
}

function checkPortugueseOptionList(studyKit: PortugueseStudyKit) {
  return [...studyKit.practiceQuestionList, ...studyKit.mockQuestionList].flatMap((question) => {
    if (question.optionList === null) return [];
    const label = question.answer.correctOptionLabel;
    return checkOptionSet(
      {
        itemId: question.questionId,
        correct: question.optionList.find((option) => option.label === label)?.text,
        distractorList: question.optionList
          .filter((option) => option.label !== label)
          .map((option) => option.text),
        expected: question.answer.expectedAnswer.value,
      },
      (left, right) => normalizeSpacing(left) === normalizeSpacing(right),
    );
  });
}

export function checkOptionList(studyKit: StudyKit, context: ValidationContext): ValidationIssue[] {
  return studyKit.subject === "math"
    ? checkMathOptionList(studyKit, context)
    : checkPortugueseOptionList(studyKit);
}

function mathQuestionList(studyKit: MathStudyKit): readonly MathStudyQuestion[] {
  return [...studyKit.practiceQuestionList, ...studyKit.mockQuestionList];
}

type ComputableItem = {
  readonly itemId: KitItemId;
  readonly statement: string;
  readonly table: KitTable | null;
  readonly answer: MathSolution;
  readonly optionList: readonly MathOption[] | null;
  readonly mismatchCode: ValidationIssueCode;
};

function listComputableItem(studyKit: MathStudyKit): readonly ComputableItem[] {
  return [
    ...mathQuestionList(studyKit).map((question) => ({
      itemId: question.questionId,
      statement: question.statement,
      table: question.table,
      answer: question.answer,
      optionList: question.optionList,
      mismatchCode: "math_recalculation_mismatch" as const,
    })),
    ...studyKit.workedExampleList.map((example) => ({
      itemId: example.exampleId,
      statement: example.statement,
      table: example.table,
      answer: example.answer,
      optionList: null,
      mismatchCode: "example_recalculation_mismatch" as const,
    })),
  ];
}

function listAnswerExpression(
  answer: MathSolution,
  optionList: readonly MathOption[] | null,
): readonly string[] {
  return [answer.expectedAnswer, ...(optionList ?? []).map((option) => option.value)].flatMap(
    (value) => (value.kind === "expression" ? [value.expression] : []),
  );
}

export function checkRecalculation(
  studyKit: StudyKit,
  { mathEvaluator }: ValidationContext,
): ValidationIssue[] {
  if (studyKit.subject !== "math") return [];
  return listComputableItem(studyKit).flatMap(({ itemId, answer, optionList, mismatchCode }) => {
    const invalidIssue = createValidationIssue("math_expression_invalid", { itemId });
    const hasInvalidAnswerExpression = listAnswerExpression(answer, optionList).some(
      (expression) => !mathEvaluator.evaluate(expression).ok,
    );
    if (!answer.computable || answer.calculationExpression === null) {
      return hasInvalidAnswerExpression ? [invalidIssue] : [];
    }
    const evaluated = mathEvaluator.evaluate(answer.calculationExpression);
    if (!evaluated.ok || hasInvalidAnswerExpression) return [invalidIssue];
    return mathEvaluator.equals(evaluated.value, answer.expectedAnswer)
      ? []
      : [createValidationIssue(mismatchCode, { itemId })];
  });
}

export function checkNonComputableExcess(studyKit: StudyKit): ValidationIssue[] {
  if (studyKit.subject !== "math") return [];
  const count = mathQuestionList(studyKit).filter((question) => !question.answer.computable).length;
  return count > MAX_NON_COMPUTABLE_MATH_QUESTION_COUNT
    ? [createValidationIssue("non_computable_excess")]
    : [];
}

export function parseBrazilianNumber(text: string): number {
  return Number(text.replace(/\./g, "").replace(",", "."));
}

function listStatementNumber(statement: string, table: KitTable | null): ReadonlySet<number> {
  const text = [
    statement,
    ...(table === null ? [] : [...table.headerList, ...table.rowList.flat()]),
  ].join(" ");
  return new Set([
    ...[...text.matchAll(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g)].map((match) =>
      parseBrazilianNumber(match[0]),
    ),
    ...[...text.matchAll(/\d+\.\d+/g)].map((match) => Number(match[0])),
    ...[...text.matchAll(/\d+/g)].map((match) => Number(match[0])),
    ...UNIT_CONVERSION_FACTOR_LIST,
  ]);
}

export function checkExpressionNumber(studyKit: StudyKit): ValidationIssue[] {
  if (studyKit.subject !== "math") return [];
  return listComputableItem(studyKit).flatMap(({ itemId, statement, table, answer }) => {
    if (answer.calculationExpression === null) return [];
    const knownNumberSet = listStatementNumber(statement, table);
    const missing = [...answer.calculationExpression.matchAll(/\d+(?:\.\d+)?/g)].find(
      (match) => !knownNumberSet.has(Number(match[0])),
    );
    return missing === undefined
      ? []
      : [
          createValidationIssue("expression_number_not_in_statement", {
            itemId,
            excerpt: missing[0],
          }),
        ];
  });
}

function greatestCommonDivisor(left: number, right: number): number {
  return right === 0 ? left : greatestCommonDivisor(right, left % right);
}

function isSimplifiedFraction(answer: ExpectedAnswer): boolean {
  if (answer.kind !== "fraction") return true;
  return greatestCommonDivisor(Math.abs(answer.numerator), answer.denominator) === 1;
}

export function checkFractionSimplified(studyKit: StudyKit): ValidationIssue[] {
  if (studyKit.subject !== "math") return [];
  return mathQuestionList(studyKit).flatMap((question) =>
    isSimplifiedFraction(question.answer.expectedAnswer)
      ? []
      : [createValidationIssue("fraction_not_simplified", { itemId: question.questionId })],
  );
}

function hasMeasurementUnitRule(topicRef: string): boolean {
  if (topicRef === OTHER_TOPIC_REF) return false;
  return findTopic(topicRef)?.validationRuleList.includes("measurement_unit") ?? false;
}

export function checkUnitPresent(studyKit: StudyKit): ValidationIssue[] {
  if (studyKit.subject !== "math") return [];
  return mathQuestionList(studyKit).flatMap((question) => {
    const answer = question.answer.expectedAnswer;
    const isMissing =
      hasMeasurementUnitRule(question.topicRef) && answer.kind === "number" && answer.unit === null;
    return isMissing
      ? [createValidationIssue("unit_missing", { itemId: question.questionId })]
      : [];
  });
}

function normalizeQuoteText(text: string): string {
  return normalizeSpacing(text.replace(/[“”«»„]/g, '"').replace(/[‘’‚]/g, "'"));
}

function trimQuote(text: string): string {
  return normalizeQuoteText(text).replace(/^["'\s]+|["'\s]+$/g, "");
}

export function checkEvidenceQuote(studyKit: StudyKit): ValidationIssue[] {
  if (studyKit.subject !== "portuguese") return [];
  const textById = new Map(
    studyKit.baseTextList.map((baseText) => [
      baseText.baseTextId,
      normalizeQuoteText(baseText.paragraphList.join(" ")),
    ]),
  );
  return [...studyKit.practiceQuestionList, ...studyKit.mockQuestionList].flatMap((question) => {
    const quote = question.answer.evidenceQuote;
    if (question.baseTextId === null || quote === null) return [];
    const baseText = textById.get(question.baseTextId) ?? "";
    const trimmedQuote = trimQuote(quote);
    return trimmedQuote !== "" && baseText.includes(trimmedQuote)
      ? []
      : [createValidationIssue("evidence_quote_not_found", { itemId: question.questionId })];
  });
}

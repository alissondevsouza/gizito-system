import {
  BASE_TEXT_WORD_RANGE_BY_GRADE,
  DUPLICATE_SIMILARITY_THRESHOLD,
  MAX_STATEMENT_WORD_COUNT_BY_GRADE,
} from "#src/constants.ts";
import { listStudyQuestion } from "#src/pedagogy/kit/answer-key.ts";
import type { StudyKit, StudyQuestion } from "#src/pedagogy/kit/schemas.ts";
import { type KitTextEntry, type KitTextField, listKitTextEntry } from "#src/pedagogy/kit/text.ts";
import { normalizeKeywordText } from "#src/pedagogy/taxonomy/unsupported.ts";
import {
  createValidationIssue,
  type ValidationIssue,
  type ValidationIssueCode,
} from "#src/pedagogy/validation/issue.ts";
import {
  findBlockedTermExcerpt,
  findExternalLinkExcerpt,
  findFigureReferenceExcerpt,
  findForbiddenMarkupExcerpt,
  findMockHintExcerpt,
  findPersonalDataExcerpt,
  hasBalancedMathMarkup,
  normalizeSpacing,
} from "#src/pedagogy/validation/patterns.ts";
import { uniqueByCodeAndItem } from "#src/pedagogy/validation/rule.ts";

const figureFieldList: readonly KitTextField[] = [
  "statement",
  "table",
  "option",
  "example_statement",
  "example_table",
];

type TextPattern = {
  readonly code: ValidationIssueCode;
  readonly findExcerpt: (text: string) => string | null;
  readonly appliesTo: (entry: KitTextEntry) => boolean;
};

const textPatternList: readonly TextPattern[] = [
  {
    code: "figure_reference",
    findExcerpt: findFigureReferenceExcerpt,
    appliesTo: (entry) => figureFieldList.includes(entry.field),
  },
  { code: "personal_data_pattern", findExcerpt: findPersonalDataExcerpt, appliesTo: () => true },
  { code: "external_link", findExcerpt: findExternalLinkExcerpt, appliesTo: () => true },
  { code: "blocked_term", findExcerpt: findBlockedTermExcerpt, appliesTo: () => true },
  {
    code: "math_markup_invalid",
    findExcerpt: (text) => (hasBalancedMathMarkup(text) ? null : text),
    appliesTo: () => true,
  },
  { code: "markup_forbidden", findExcerpt: findForbiddenMarkupExcerpt, appliesTo: () => true },
];

export function checkTextPattern(studyKit: StudyKit): ValidationIssue[] {
  const entryList = listKitTextEntry(studyKit);
  return textPatternList.flatMap((pattern) =>
    uniqueByCodeAndItem(
      entryList.flatMap((entry) => {
        if (!pattern.appliesTo(entry)) return [];
        const excerpt = pattern.findExcerpt(entry.text);
        return excerpt === null
          ? []
          : [createValidationIssue(pattern.code, { itemId: entry.itemId, excerpt })];
      }),
    ),
  );
}

function optionTextList(question: StudyQuestion): readonly string[] {
  return (question.optionList ?? []).map((option) =>
    "text" in option ? option.text : JSON.stringify(option.value),
  );
}

function questionTextList(question: StudyQuestion): readonly string[] {
  const tableCellList =
    question.table === null ? [] : [...question.table.headerList, ...question.table.rowList.flat()];
  return [question.statement, ...tableCellList, ...optionTextList(question)];
}

function duplicateKeyOf(question: StudyQuestion): string {
  return questionTextList(question)
    .map((text) => normalizeSpacing(text).toLowerCase())
    .join("\n");
}

export function checkDuplicateQuestion(studyKit: StudyKit): ValidationIssue[] {
  const seenKeySet = new Set<string>();
  return listStudyQuestion(studyKit).flatMap((question) => {
    const key = duplicateKeyOf(question);
    if (seenKeySet.has(key)) {
      return [createValidationIssue("duplicate_question", { itemId: question.questionId })];
    }
    seenKeySet.add(key);
    return [];
  });
}

function wordSetOf(text: string): ReadonlySet<string> {
  return new Set(
    normalizeKeywordText(text)
      .split(" ")
      .filter((word) => word !== ""),
  );
}

export function jaccardSimilarity(left: string, right: string): number {
  const leftSet = wordSetOf(left);
  const rightSet = wordSetOf(right);
  const intersectionCount = [...leftSet].filter((word) => rightSet.has(word)).length;
  const unionCount = leftSet.size + rightSet.size - intersectionCount;
  return unionCount === 0 ? 0 : intersectionCount / unionCount;
}

function isSimilar(left: string, right: string): boolean {
  return jaccardSimilarity(left, right) >= DUPLICATE_SIMILARITY_THRESHOLD;
}

export function checkSimilarQuestion(studyKit: StudyKit): ValidationIssue[] {
  const questionList = listStudyQuestion(studyKit);
  return questionList.flatMap((question, index) => {
    const hasSimilarEarlier = questionList
      .slice(0, index)
      .some(
        (earlier) =>
          duplicateKeyOf(earlier) !== duplicateKeyOf(question) &&
          isSimilar(earlier.statement, question.statement),
      );
    return hasSimilarEarlier
      ? [createValidationIssue("similar_question", { itemId: question.questionId })]
      : [];
  });
}

export function checkExampleSimilarToQuestion(studyKit: StudyKit): ValidationIssue[] {
  const questionList = listStudyQuestion(studyKit);
  return studyKit.workedExampleList.flatMap((example) =>
    questionList.some((question) => isSimilar(example.statement, question.statement))
      ? [createValidationIssue("example_similar_to_question", { itemId: example.exampleId })]
      : [],
  );
}

export function checkMockHint(studyKit: StudyKit): ValidationIssue[] {
  return studyKit.mockQuestionList.flatMap((question) => {
    const excerpt = questionTextList(question)
      .map(findMockHintExcerpt)
      .find((match) => match !== null);
    return excerpt === undefined || excerpt === null
      ? []
      : [createValidationIssue("mock_hint", { itemId: question.questionId, excerpt })];
  });
}

export function countKitWord(text: string): number {
  return text
    .replace(/\\\([\s\S]*?\\\)/g, " x ")
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

export function checkStatementLength(studyKit: StudyKit): ValidationIssue[] {
  const maximum = MAX_STATEMENT_WORD_COUNT_BY_GRADE[studyKit.grade];
  return listStudyQuestion(studyKit).flatMap((question) =>
    countKitWord(question.statement) > maximum
      ? [createValidationIssue("statement_too_long", { itemId: question.questionId })]
      : [],
  );
}

export function checkBaseTextLength(studyKit: StudyKit): ValidationIssue[] {
  const range = BASE_TEXT_WORD_RANGE_BY_GRADE[studyKit.grade];
  return studyKit.baseTextList.flatMap((baseText) => {
    const wordCount = countKitWord(baseText.paragraphList.join(" "));
    return wordCount >= range.min && wordCount <= range.max
      ? []
      : [createValidationIssue("base_text_length", { itemId: baseText.baseTextId })];
  });
}

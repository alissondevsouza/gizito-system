import type { ExpectedAnswer } from "#src/pedagogy/expected-answer.ts";
import type {
  MathOption,
  MathSolution,
  PortugueseOption,
  PortugueseSolution,
  StudyKit,
} from "#src/pedagogy/kit/schemas.ts";
import type { KitItemId, KitTable, TopicRef } from "#src/pedagogy/kit-item.ts";

export const kitTextFieldList = [
  "topic_label",
  "review_title",
  "review_paragraph",
  "review_key_point",
  "base_text_title",
  "base_text_paragraph",
  "example_title",
  "example_statement",
  "example_table",
  "example_step",
  "example_commentary",
  "statement",
  "table",
  "option",
  "answer_text",
  "solution_step",
  "explanation",
  "evidence_quote",
  "study_tip",
] as const;
export type KitTextField = (typeof kitTextFieldList)[number];

export type KitTextEntry = {
  readonly itemId: KitItemId | TopicRef | null;
  readonly field: KitTextField;
  readonly text: string;
};

type ItemId = KitTextEntry["itemId"];

function entryListOf(
  itemId: ItemId,
  field: KitTextField,
  textList: readonly string[],
): KitTextEntry[] {
  return textList.map((text) => ({ itemId, field, text }));
}

function tableCellList(table: KitTable | null): readonly string[] {
  return table === null ? [] : [...table.headerList, ...table.rowList.flat()];
}

function answerTextList(answer: ExpectedAnswer): readonly string[] {
  if (answer.kind === "text") return [answer.value, ...answer.acceptedList];
  return answer.kind === "set" ? answer.valueList : [];
}

function optionTextList(
  optionList: readonly (MathOption | PortugueseOption)[] | null,
): readonly string[] {
  return (optionList ?? []).flatMap((option) =>
    "text" in option ? [option.text] : answerTextList(option.value),
  );
}

function solutionEntryList(
  itemId: ItemId,
  solution: MathSolution | PortugueseSolution,
): KitTextEntry[] {
  return [
    ...entryListOf(itemId, "answer_text", answerTextList(solution.expectedAnswer)),
    ...entryListOf(itemId, "solution_step", solution.solutionStepList),
    ...entryListOf(itemId, "explanation", [solution.explanation]),
    ...entryListOf(
      itemId,
      "evidence_quote",
      solution.evidenceQuote === null ? [] : [solution.evidenceQuote],
    ),
  ];
}

export function listKitTextEntry(studyKit: StudyKit): readonly KitTextEntry[] {
  const questionList = [...studyKit.practiceQuestionList, ...studyKit.mockQuestionList];
  return [
    ...entryListOf(
      null,
      "topic_label",
      studyKit.topicList.map((topic) => topic.label),
    ),
    ...studyKit.reviewSectionList.flatMap((section) => [
      ...entryListOf(section.topicRef, "review_title", [section.title]),
      ...entryListOf(section.topicRef, "review_paragraph", section.paragraphList),
      ...entryListOf(section.topicRef, "review_key_point", section.keyPointList),
    ]),
    ...studyKit.baseTextList.flatMap((baseText) => [
      ...entryListOf(baseText.baseTextId, "base_text_title", [baseText.title]),
      ...entryListOf(baseText.baseTextId, "base_text_paragraph", baseText.paragraphList),
    ]),
    ...studyKit.workedExampleList.flatMap((example) => [
      ...entryListOf(example.exampleId, "example_title", [example.title]),
      ...entryListOf(example.exampleId, "example_statement", [example.statement]),
      ...entryListOf(example.exampleId, "example_table", tableCellList(example.table)),
      ...entryListOf(example.exampleId, "example_step", example.stepList),
      ...entryListOf(example.exampleId, "example_commentary", [example.commentary]),
      ...solutionEntryList(example.exampleId, example.answer),
    ]),
    ...questionList.flatMap((question) => [
      ...entryListOf(question.questionId, "statement", [question.statement]),
      ...entryListOf(question.questionId, "table", tableCellList(question.table)),
      ...entryListOf(question.questionId, "option", optionTextList(question.optionList)),
      ...solutionEntryList(question.questionId, question.answer),
    ]),
    ...entryListOf(null, "study_tip", [studyKit.studyTip]),
  ];
}

import { z } from "zod";
import {
  MAX_BASE_TEXT_COUNT,
  MAX_MOCK_SUGGESTED_MINUTES,
  MAX_TOPIC_COUNT,
  MIN_MOCK_SUGGESTED_MINUTES,
  MIN_TOPIC_COUNT,
  MOCK_QUESTION_COUNT,
  MULTIPLE_CHOICE_OPTION_COUNT,
  PRACTICE_QUESTION_COUNT,
  STUDY_KIT_FORMAT_VERSION,
  WORKED_EXAMPLE_COUNT,
} from "#src/constants.ts";
import {
  difficultySchema,
  gradeSchema,
  perceivedDifficultySchema,
  questionBlockSchema,
  questionTypeSchema,
} from "#src/enums.ts";
import { expectedAnswerSchema, textAnswerSchema } from "#src/pedagogy/expected-answer.ts";
import {
  materialProfileSchema,
  sourceWarningCodeSchema,
} from "#src/pedagogy/extraction/schemas.ts";
import {
  baseTextIdSchema,
  generationVersionSchema,
  kitTableSchema,
  kitTextListSchema,
  kitTextSchema,
  mockQuestionIdSchema,
  type OptionLabel,
  optionLabelList,
  optionLabelSchema,
  practiceQuestionIdSchema,
  questionIdSchema,
  topicRefSchema,
  workedExampleIdSchema,
} from "#src/pedagogy/kit-item.ts";
import { TOPIC_LABEL_MAX_LENGTH, uniqueListSchema } from "#src/pedagogy/taxonomy/schemas.ts";
import { validationIssueSchema } from "#src/pedagogy/validation/issue.ts";

const COMPUTABLE_ANSWER_KIND_LIST: readonly string[] = ["number", "fraction", "expression"];

const titleSchema = kitTextSchema(3, 60);
const statementSchema = kitTextSchema(10, 700);
const explanationSchema = kitTextSchema(20, 600);
const stepListSchema = (minCount: number, maxCount: number) =>
  kitTextListSchema(minCount, maxCount, 5, 300);

function hasOrderedLabelList(optionList: readonly { readonly label: OptionLabel }[]): boolean {
  return optionList.every((option, index) => option.label === optionLabelList[index]);
}

const orderedLabelMessage = { message: "options must be labeled A to D in order" };

export const mathOptionSchema = z.strictObject({
  label: optionLabelSchema,
  value: expectedAnswerSchema,
});
export type MathOption = z.infer<typeof mathOptionSchema>;

export const portugueseOptionSchema = z.strictObject({
  label: optionLabelSchema,
  text: kitTextSchema(1, 200),
});
export type PortugueseOption = z.infer<typeof portugueseOptionSchema>;

const mathOptionListSchema = z
  .array(mathOptionSchema)
  .length(MULTIPLE_CHOICE_OPTION_COUNT)
  .refine(hasOrderedLabelList, orderedLabelMessage);
const portugueseOptionListSchema = z
  .array(portugueseOptionSchema)
  .length(MULTIPLE_CHOICE_OPTION_COUNT)
  .refine(hasOrderedLabelList, orderedLabelMessage);

export const mathSolutionSchema = z
  .strictObject({
    correctOptionLabel: optionLabelSchema.nullable(),
    expectedAnswer: expectedAnswerSchema,
    computable: z.boolean(),
    calculationExpression: z.string().trim().min(1).max(200).nullable(),
    solutionStepList: stepListSchema(1, 6),
    explanation: explanationSchema,
    evidenceQuote: z.null(),
  })
  .refine((solution) => solution.computable === (solution.calculationExpression !== null), {
    message: "calculationExpression is required exactly when computable",
    path: ["calculationExpression"],
  })
  .refine(
    (solution) =>
      !solution.computable || COMPUTABLE_ANSWER_KIND_LIST.includes(solution.expectedAnswer.kind),
    { message: "a computable answer is a number, fraction or expression", path: ["computable"] },
  );
export type MathSolution = z.infer<typeof mathSolutionSchema>;

export const portugueseSolutionSchema = z.strictObject({
  correctOptionLabel: optionLabelSchema.nullable(),
  expectedAnswer: textAnswerSchema,
  computable: z.literal(false),
  calculationExpression: z.null(),
  solutionStepList: stepListSchema(0, 4),
  explanation: explanationSchema,
  evidenceQuote: z.string().trim().min(3).max(240).nullable(),
});
export type PortugueseSolution = z.infer<typeof portugueseSolutionSchema>;

type QuestionCoherenceInput = {
  readonly optionList: readonly unknown[] | null;
  readonly answer: { readonly correctOptionLabel: OptionLabel | null };
};

function hasCoherentCorrectOption(question: QuestionCoherenceInput): boolean {
  return (question.optionList === null) === (question.answer.correctOptionLabel === null);
}

const correctOptionMessage = {
  message: "correctOptionLabel is set exactly when optionList is",
  path: ["answer", "correctOptionLabel"],
};

const mathQuestionShape = {
  statement: statementSchema,
  table: kitTableSchema.nullable(),
  optionList: mathOptionListSchema.nullable(),
  answer: mathSolutionSchema,
};

const portugueseQuestionShape = {
  statement: statementSchema,
  table: kitTableSchema.nullable(),
  optionList: portugueseOptionListSchema.nullable(),
  answer: portugueseSolutionSchema,
};

export const reviewSectionSchema = z.strictObject({
  topicRef: topicRefSchema,
  title: titleSchema,
  paragraphList: kitTextListSchema(1, 4, 20, 600),
  keyPointList: kitTextListSchema(2, 5, 5, 140),
});
export type ReviewSection = z.infer<typeof reviewSectionSchema>;

const baseTextShape = {
  baseTextId: baseTextIdSchema,
  title: titleSchema,
  paragraphList: kitTextListSchema(1, 10, 10, 800),
};
export const baseTextSchema = z.strictObject(baseTextShape);
export type BaseText = z.infer<typeof baseTextSchema>;

const workedExampleShape = {
  exampleId: workedExampleIdSchema,
  title: titleSchema,
  statement: kitTextSchema(10, 600),
  table: kitTableSchema.nullable(),
  stepList: stepListSchema(2, 6),
  commentary: kitTextSchema(10, 300),
};

const exampleHasNoOptionMessage = {
  message: "a worked example has no correct option",
  path: ["answer", "correctOptionLabel"],
};

function hasNoCorrectOption(example: {
  readonly answer: { readonly correctOptionLabel: OptionLabel | null };
}): boolean {
  return example.answer.correctOptionLabel === null;
}

const mathWorkedExampleShape = { ...workedExampleShape, answer: mathSolutionSchema };
const portugueseWorkedExampleShape = { ...workedExampleShape, answer: portugueseSolutionSchema };

const mathWorkedExampleSchema = z
  .strictObject(mathWorkedExampleShape)
  .refine(hasNoCorrectOption, exampleHasNoOptionMessage);
const portugueseWorkedExampleSchema = z
  .strictObject(portugueseWorkedExampleShape)
  .refine(hasNoCorrectOption, exampleHasNoOptionMessage);

const mathPracticeQuestionSchema = z
  .strictObject({ questionId: practiceQuestionIdSchema, ...mathQuestionShape })
  .refine(hasCoherentCorrectOption, correctOptionMessage);
const mathMockQuestionSchema = z
  .strictObject({ questionId: mockQuestionIdSchema, ...mathQuestionShape })
  .refine(hasCoherentCorrectOption, correctOptionMessage);
const portuguesePracticeQuestionSchema = z
  .strictObject({ questionId: practiceQuestionIdSchema, ...portugueseQuestionShape })
  .refine(hasCoherentCorrectOption, correctOptionMessage);
const portugueseMockQuestionSchema = z
  .strictObject({ questionId: mockQuestionIdSchema, ...portugueseQuestionShape })
  .refine(hasCoherentCorrectOption, correctOptionMessage);

const kitTailShape = {
  mockSuggestedMinutes: z.int().min(MIN_MOCK_SUGGESTED_MINUTES).max(MAX_MOCK_SUGGESTED_MINUTES),
  studyTip: kitTextSchema(10, 200),
};

const reviewSectionListSchema = z
  .array(reviewSectionSchema)
  .min(MIN_TOPIC_COUNT)
  .max(MAX_TOPIC_COUNT);

export const mathKitContentSchema = z.strictObject({
  reviewSectionList: reviewSectionListSchema,
  workedExampleList: z.array(mathWorkedExampleSchema).length(WORKED_EXAMPLE_COUNT),
  baseTextList: z.array(baseTextSchema).max(0),
  practiceQuestionList: z.array(mathPracticeQuestionSchema).length(PRACTICE_QUESTION_COUNT),
  mockQuestionList: z.array(mathMockQuestionSchema).length(MOCK_QUESTION_COUNT),
  ...kitTailShape,
});
export type MathKitContent = z.infer<typeof mathKitContentSchema>;

export const portugueseKitContentSchema = z.strictObject({
  reviewSectionList: reviewSectionListSchema,
  workedExampleList: z.array(portugueseWorkedExampleSchema).length(WORKED_EXAMPLE_COUNT),
  baseTextList: z.array(baseTextSchema).min(1).max(MAX_BASE_TEXT_COUNT),
  practiceQuestionList: z.array(portuguesePracticeQuestionSchema).length(PRACTICE_QUESTION_COUNT),
  mockQuestionList: z.array(portugueseMockQuestionSchema).length(MOCK_QUESTION_COUNT),
  ...kitTailShape,
});
export type PortugueseKitContent = z.infer<typeof portugueseKitContentSchema>;

export const kitContentSchemaBySubject = {
  math: mathKitContentSchema,
  portuguese: portugueseKitContentSchema,
} as const;
export type KitContent = MathKitContent | PortugueseKitContent;

export const mathKitRepairSchema = z.strictObject({
  reviewSectionList: z.array(reviewSectionSchema).max(MAX_TOPIC_COUNT),
  workedExampleList: z.array(mathWorkedExampleSchema).max(WORKED_EXAMPLE_COUNT),
  baseTextList: z.array(baseTextSchema).max(0),
  practiceQuestionList: z.array(mathPracticeQuestionSchema).max(PRACTICE_QUESTION_COUNT),
  mockQuestionList: z.array(mathMockQuestionSchema).max(MOCK_QUESTION_COUNT),
});
export type MathKitRepair = z.infer<typeof mathKitRepairSchema>;

export const portugueseKitRepairSchema = z.strictObject({
  reviewSectionList: z.array(reviewSectionSchema).max(MAX_TOPIC_COUNT),
  workedExampleList: z.array(portugueseWorkedExampleSchema).max(WORKED_EXAMPLE_COUNT),
  baseTextList: z.array(baseTextSchema).max(MAX_BASE_TEXT_COUNT),
  practiceQuestionList: z.array(portuguesePracticeQuestionSchema).max(PRACTICE_QUESTION_COUNT),
  mockQuestionList: z.array(portugueseMockQuestionSchema).max(MOCK_QUESTION_COUNT),
});
export type PortugueseKitRepair = z.infer<typeof portugueseKitRepairSchema>;

export const kitRepairSchemaBySubject = {
  math: mathKitRepairSchema,
  portuguese: portugueseKitRepairSchema,
} as const;

const studyQuestionMetaShape = {
  questionId: questionIdSchema,
  block: questionBlockSchema,
  number: z.int().min(1).max(Math.max(PRACTICE_QUESTION_COUNT, MOCK_QUESTION_COUNT)),
  topicRef: topicRefSchema,
  difficulty: difficultySchema,
  questionType: questionTypeSchema,
  isContextualized: z.boolean(),
  skillFocus: z.string().trim().min(10).max(140),
  baseTextId: baseTextIdSchema.nullable(),
};

type StudyQuestionCoherenceInput = QuestionCoherenceInput & {
  readonly questionType: "multiple_choice" | "open_answer";
  readonly baseTextId: string | null;
  readonly answer: { readonly evidenceQuote: string | null };
};

function hasOptionListOfQuestionType(question: StudyQuestionCoherenceInput): boolean {
  return (question.optionList !== null) === (question.questionType === "multiple_choice");
}

function hasEvidenceQuoteOfBaseText(question: StudyQuestionCoherenceInput): boolean {
  return (question.baseTextId !== null) === (question.answer.evidenceQuote !== null);
}

const optionListOfQuestionTypeMessage = {
  message: "optionList is set exactly for multiple choice",
  path: ["optionList"],
};
const evidenceQuoteOfBaseTextMessage = {
  message: "evidenceQuote is set exactly when the question cites a base text",
  path: ["answer", "evidenceQuote"],
};

export const mathStudyQuestionSchema = z
  .strictObject({ ...studyQuestionMetaShape, ...mathQuestionShape })
  .refine(hasCoherentCorrectOption, correctOptionMessage)
  .refine(hasOptionListOfQuestionType, optionListOfQuestionTypeMessage)
  .refine(hasEvidenceQuoteOfBaseText, evidenceQuoteOfBaseTextMessage);
export type MathStudyQuestion = z.infer<typeof mathStudyQuestionSchema>;

export const portugueseStudyQuestionSchema = z
  .strictObject({ ...studyQuestionMetaShape, ...portugueseQuestionShape })
  .refine(hasCoherentCorrectOption, correctOptionMessage)
  .refine(hasOptionListOfQuestionType, optionListOfQuestionTypeMessage)
  .refine(hasEvidenceQuoteOfBaseText, evidenceQuoteOfBaseTextMessage);
export type PortugueseStudyQuestion = z.infer<typeof portugueseStudyQuestionSchema>;
export type StudyQuestion = MathStudyQuestion | PortugueseStudyQuestion;

export const studyTopicSchema = z.strictObject({
  topicRef: topicRefSchema,
  label: z.string().trim().min(3).max(TOPIC_LABEL_MAX_LENGTH),
});
export type StudyTopic = z.infer<typeof studyTopicSchema>;

export const studyBaseTextSchema = z.strictObject({ ...baseTextShape, block: questionBlockSchema });
export type StudyBaseText = z.infer<typeof studyBaseTextSchema>;

const studyKitCommonShape = {
  formatVersion: z.literal(STUDY_KIT_FORMAT_VERSION),
  grade: gradeSchema,
  perceivedDifficulty: perceivedDifficultySchema.nullable(),
  taxonomyVersion: z.string().min(1),
  generationVersion: generationVersionSchema,
  topicList: z.array(studyTopicSchema).min(MIN_TOPIC_COUNT).max(MAX_TOPIC_COUNT),
  materialProfile: materialProfileSchema,
  sourceWarningCodeList: uniqueListSchema(sourceWarningCodeSchema),
  reviewSectionList: reviewSectionListSchema,
  baseTextList: z.array(studyBaseTextSchema).max(MAX_BASE_TEXT_COUNT),
  ...kitTailShape,
  qualityCheckList: z
    .array(validationIssueSchema)
    .refine((issueList) => issueList.every((issue) => issue.severity === "warning"), {
      message: "a published kit never carries a blocker",
    }),
};

type StudyKitCoherenceInput = {
  readonly baseTextList: readonly { readonly baseTextId: string; readonly block: string }[];
  readonly practiceQuestionList: readonly {
    readonly baseTextId: string | null;
    readonly block: string;
  }[];
  readonly mockQuestionList: readonly {
    readonly baseTextId: string | null;
    readonly block: string;
  }[];
};

function citesExistingBaseTextOfSameBlock(kit: StudyKitCoherenceInput): boolean {
  const blockOfBaseText = new Map(kit.baseTextList.map((text) => [text.baseTextId, text.block]));
  return [...kit.practiceQuestionList, ...kit.mockQuestionList].every(
    (question) =>
      question.baseTextId === null || blockOfBaseText.get(question.baseTextId) === question.block,
  );
}

const baseTextCitationMessage = {
  message: "a question cites a base text of its own block",
  path: ["baseTextList"],
};

export const mathStudyKitSchema = z
  .strictObject({
    subject: z.literal("math"),
    ...studyKitCommonShape,
    workedExampleList: z
      .array(
        z
          .strictObject({ ...mathWorkedExampleShape, topicRef: topicRefSchema })
          .refine(hasNoCorrectOption, exampleHasNoOptionMessage),
      )
      .length(WORKED_EXAMPLE_COUNT),
    practiceQuestionList: z.array(mathStudyQuestionSchema).length(PRACTICE_QUESTION_COUNT),
    mockQuestionList: z.array(mathStudyQuestionSchema).length(MOCK_QUESTION_COUNT),
  })
  .refine(citesExistingBaseTextOfSameBlock, baseTextCitationMessage);
export type MathStudyKit = z.infer<typeof mathStudyKitSchema>;

export const portugueseStudyKitSchema = z
  .strictObject({
    subject: z.literal("portuguese"),
    ...studyKitCommonShape,
    workedExampleList: z
      .array(
        z
          .strictObject({ ...portugueseWorkedExampleShape, topicRef: topicRefSchema })
          .refine(hasNoCorrectOption, exampleHasNoOptionMessage),
      )
      .length(WORKED_EXAMPLE_COUNT),
    practiceQuestionList: z.array(portugueseStudyQuestionSchema).length(PRACTICE_QUESTION_COUNT),
    mockQuestionList: z.array(portugueseStudyQuestionSchema).length(MOCK_QUESTION_COUNT),
  })
  .refine(citesExistingBaseTextOfSameBlock, baseTextCitationMessage);
export type PortugueseStudyKit = z.infer<typeof portugueseStudyKitSchema>;

export const studyKitSchema = z.discriminatedUnion("subject", [
  mathStudyKitSchema,
  portugueseStudyKitSchema,
]);
export type StudyKit = z.infer<typeof studyKitSchema>;
export type StudyWorkedExample = StudyKit["workedExampleList"][number];

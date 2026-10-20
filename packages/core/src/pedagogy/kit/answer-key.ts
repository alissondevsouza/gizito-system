import type { Difficulty, QuestionBlock } from "#src/enums.ts";
import type { ExpectedAnswer } from "#src/pedagogy/expected-answer.ts";
import type {
  MathOption,
  MathSolution,
  PortugueseOption,
  PortugueseSolution,
  StudyKit,
  StudyQuestion,
} from "#src/pedagogy/kit/schemas.ts";
import type { QuestionId, TopicRef } from "#src/pedagogy/kit-item.ts";

export type AnswerKeyEntry = {
  readonly questionId: QuestionId;
  readonly block: QuestionBlock;
  readonly number: number;
  readonly topicRef: TopicRef;
  readonly difficulty: Difficulty;
  readonly answer: MathSolution | PortugueseSolution;
  readonly correctOption: MathOption | PortugueseOption | null;
};

function correctOptionOf(question: StudyQuestion): MathOption | PortugueseOption | null {
  const optionList: readonly (MathOption | PortugueseOption)[] = question.optionList ?? [];
  return optionList.find((option) => option.label === question.answer.correctOptionLabel) ?? null;
}

export function listStudyQuestion(studyKit: StudyKit): readonly StudyQuestion[] {
  return [...studyKit.practiceQuestionList, ...studyKit.mockQuestionList];
}

export function listAnswerKey(studyKit: StudyKit): readonly AnswerKeyEntry[] {
  return listStudyQuestion(studyKit).map((question) => ({
    questionId: question.questionId,
    block: question.block,
    number: question.number,
    topicRef: question.topicRef,
    difficulty: question.difficulty,
    answer: question.answer,
    correctOption: correctOptionOf(question),
  }));
}

export const MONEY_UNIT = "R$";

const MONEY_FRACTION_DIGIT_COUNT = 2;

function plainDecimalText(value: number, fixedFractionDigitCount: number | null): string {
  const absoluteValue = Math.abs(value);
  if (fixedFractionDigitCount !== null) {
    return new Intl.NumberFormat("en-US", {
      useGrouping: false,
      minimumFractionDigits: fixedFractionDigitCount,
      maximumFractionDigits: fixedFractionDigitCount,
    }).format(absoluteValue);
  }
  const shortestText = absoluteValue.toString();
  return /e/i.test(shortestText)
    ? new Intl.NumberFormat("en-US", { useGrouping: false, maximumSignificantDigits: 15 }).format(
        absoluteValue,
      )
    : shortestText;
}

export function formatBrazilianDecimal(
  value: number,
  fixedFractionDigitCount: number | null,
): string {
  const [integerPart = "0", fractionPart = ""] = plainDecimalText(
    value,
    fixedFractionDigitCount,
  ).split(".");
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const isNegative = value < 0 && /[1-9]/.test(`${integerPart}${fractionPart}`);
  return `${isNegative ? "-" : ""}${groupedInteger}${fractionPart === "" ? "" : `,${fractionPart}`}`;
}

const ATTACHED_UNIT_LIST: readonly string[] = ["%", "°"];

function withUnit(text: string, unit: string | null): string {
  if (unit === null) return text;
  if (unit === MONEY_UNIT) return `${MONEY_UNIT} ${text}`;
  return ATTACHED_UNIT_LIST.includes(unit) ? `${text}${unit}` : `${text} ${unit}`;
}

export type ExpectedAnswerFormatOption = {
  readonly formatExpression: (expression: string) => string;
};

export function formatExpectedAnswer(
  answer: ExpectedAnswer,
  { formatExpression }: ExpectedAnswerFormatOption,
): string {
  switch (answer.kind) {
    case "number":
      return withUnit(
        formatBrazilianDecimal(
          answer.value,
          answer.unit === MONEY_UNIT ? MONEY_FRACTION_DIGIT_COUNT : null,
        ),
        answer.unit,
      );
    case "fraction": {
      const sign = answer.numerator < 0 ? "-" : "";
      return withUnit(
        `\\(${sign}\\frac{${Math.abs(answer.numerator)}}{${answer.denominator}}\\)`,
        answer.unit,
      );
    }
    case "expression":
      return `\\(${formatExpression(answer.expression)}\\)`;
    case "set":
      return answer.valueList.join("; ");
    case "text":
      return answer.value;
  }
}

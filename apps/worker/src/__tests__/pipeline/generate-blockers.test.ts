import { describe, expect, it } from "bun:test";
import {
  type MathKitContent,
  type PortugueseKitContent,
  type ReviewResult,
  type ValidationIssueCode,
  type ValidationRepair,
  validationIssueCodeList,
  validationIssueRuleMap,
} from "@gizito/core";
import { buildMathFixture, buildPortugueseFixture } from "@gizito/core/testing";
import type { FakeAiProvider } from "@gizito/integrations/fakes";
import {
  createFixtureAiProvider,
  dependenciesOf,
  type KitFixture,
  requestOf,
  reviewWithIssueOf,
} from "#src/__tests__/pipeline/__fixtures__/generation.ts";
import { generateKit } from "#src/pipeline/generate.ts";

const math = buildMathFixture();
const portuguese = buildPortugueseFixture();

type MathPracticeQuestion = MathKitContent["practiceQuestionList"][number];
type PortuguesePracticeQuestion = PortugueseKitContent["practiceQuestionList"][number];

function mathPracticeWith(
  questionId: string,
  edit: (question: MathPracticeQuestion) => MathPracticeQuestion,
): MathKitContent {
  return {
    ...math.content,
    practiceQuestionList: math.content.practiceQuestionList.map((question) =>
      question.questionId === questionId ? edit(question) : question,
    ),
  };
}

function portuguesePracticeWith(
  questionId: string,
  edit: (question: PortuguesePracticeQuestion) => PortuguesePracticeQuestion,
): PortugueseKitContent {
  return {
    ...portuguese.content,
    practiceQuestionList: portuguese.content.practiceQuestionList.map((question) =>
      question.questionId === questionId ? edit(question) : question,
    ),
  };
}

function withStatement(statement: string) {
  return (question: MathPracticeQuestion): MathPracticeQuestion => ({ ...question, statement });
}

function withOptionValueFrom(targetLabel: string, sourceLabel: string) {
  return (question: MathPracticeQuestion): MathPracticeQuestion => {
    const source = question.optionList?.find((option) => option.label === sourceLabel);
    if (source === undefined) throw new Error(`p1 sem a alternativa ${sourceLabel}`);
    return {
      ...question,
      optionList:
        question.optionList?.map((option) =>
          option.label === targetLabel ? { ...option, value: source.value } : option,
        ) ?? null,
    };
  };
}

const NUMBER_999 = { kind: "number", value: 999, unit: null, tolerance: 0 } as const;

function reviewWith(
  fixture: KitFixture,
  edit: (review: ReviewResult) => ReviewResult,
): (aiProvider: FakeAiProvider) => void {
  return (aiProvider) =>
    aiProvider.enqueueOutput("review", edit(reviewWithIssueOf(fixture.studyKit, [])));
}

function itemReviewCase(
  code: ValidationIssueCode,
  reviewCode: ReviewResult["itemReviewList"][number]["issueList"][number]["code"],
  itemId: "p2" | "e1" | "p1",
  fixture: KitFixture = math,
): BlockerCase {
  return {
    code,
    fixture,
    repair: "item",
    arrange: (aiProvider) =>
      aiProvider.enqueueOutput(
        "review",
        reviewWithIssueOf(fixture.studyKit, [{ itemId, code: reviewCode }]),
      ),
  };
}

function kitReviewCase(
  code: ValidationIssueCode,
  kitIssue: ReviewResult["kitIssueList"][number],
  repair: RegenerationRepair,
  fixture: KitFixture = math,
): BlockerCase {
  return {
    code,
    fixture,
    repair,
    arrange: (aiProvider) =>
      aiProvider.enqueueOutput("review", reviewWithIssueOf(fixture.studyKit, [], [kitIssue])),
  };
}

type RegenerationRepair = Exclude<ValidationRepair, "none">;

type BlockerCase = {
  readonly code: ValidationIssueCode;
  readonly name?: string;
  readonly fixture: KitFixture;
  readonly repair: RegenerationRepair;
  readonly arrange: (aiProvider: FakeAiProvider) => void;
};

function regenerationRepairOf(code: ValidationIssueCode): RegenerationRepair {
  const { repair } = validationIssueRuleMap[code];
  if (repair === null || repair === "none") throw new Error(`${code} não regenera`);
  return repair;
}

function contentCase(
  code: ValidationIssueCode,
  content: MathKitContent | PortugueseKitContent,
  fixture: KitFixture = math,
  name?: string,
): BlockerCase {
  return {
    code,
    name,
    fixture,
    repair: regenerationRepairOf(code),
    arrange: (aiProvider) => aiProvider.enqueueOutput("generate", content),
  };
}

function planCase(
  code: ValidationIssueCode,
  plan: unknown,
  fixture: KitFixture = math,
): BlockerCase {
  return {
    code,
    fixture,
    repair: "plan",
    arrange: (aiProvider) => aiProvider.enqueueOutput("plan", plan),
  };
}

const kitIssueNote = "nota da revisão sobre o kit";

const blockerCaseList: readonly BlockerCase[] = [
  planCase("plan_output_invalid", { topicObjectiveList: "fora do schema" }),
  planCase("plan_slot_mismatch", {
    ...math.plan,
    slotDetailList: [
      math.plan.slotDetailList[1],
      math.plan.slotDetailList[0],
      ...math.plan.slotDetailList.slice(2),
    ],
  }),
  planCase("plan_multiple_choice_mix", {
    ...math.plan,
    slotDetailList: math.plan.slotDetailList.map((detail) => ({
      ...detail,
      questionType: "open_answer",
    })),
  }),
  planCase("plan_contextualized_minority", {
    ...math.plan,
    slotDetailList: math.plan.slotDetailList.map((detail) => ({
      ...detail,
      isContextualized: false,
    })),
  }),
  planCase(
    "plan_base_text_invalid",
    {
      ...portuguese.plan,
      slotDetailList: portuguese.plan.slotDetailList.map((detail) =>
        detail.slotId === "m1" ? { ...detail, baseTextId: null } : detail,
      ),
    },
    portuguese,
  ),
  {
    code: "kit_output_invalid",
    fixture: math,
    repair: "kit",
    arrange: (aiProvider) => aiProvider.enqueueFailure("generate", "ai_output_invalid"),
  },
  contentCase("kit_slot_mismatch", {
    ...math.content,
    practiceQuestionList: [
      ...math.content.practiceQuestionList.slice(1, 2),
      ...math.content.practiceQuestionList.slice(0, 1),
      ...math.content.practiceQuestionList.slice(2),
    ],
  }),
  contentCase("option_duplicate", mathPracticeWith("p1", withOptionValueFrom("D", "C"))),
  contentCase(
    "correct_option_mismatch",
    mathPracticeWith("p1", (question) => ({
      ...question,
      answer: { ...question.answer, correctOptionLabel: "B" },
    })),
  ),
  contentCase("distractor_equivalent", mathPracticeWith("p1", withOptionValueFrom("B", "A"))),
  contentCase(
    "math_recalculation_mismatch",
    mathPracticeWith("p2", (question) => ({
      ...question,
      answer: { ...question.answer, expectedAnswer: NUMBER_999 },
    })),
  ),
  contentCase(
    "math_expression_invalid",
    mathPracticeWith("p2", (question) => ({
      ...question,
      answer: { ...question.answer, calculationExpression: "Infinity" },
    })),
  ),
  contentCase("example_recalculation_mismatch", {
    ...math.content,
    workedExampleList: math.content.workedExampleList.map((example) =>
      example.exampleId === "e1"
        ? { ...example, answer: { ...example.answer, expectedAnswer: NUMBER_999 } }
        : example,
    ),
  }),
  contentCase(
    "evidence_quote_not_found",
    portuguesePracticeWith("p1", (question) => ({
      ...question,
      answer: { ...question.answer, evidenceQuote: "uma frase que não está no texto-base" },
    })),
    portuguese,
  ),
  contentCase(
    "figure_reference",
    mathPracticeWith("p2", withStatement("Observe a figura abaixo e diga quantos lados ela tem.")),
  ),
  contentCase(
    "personal_data_pattern",
    mathPracticeWith("p2", (question) => ({
      ...question,
      answer: {
        ...question.answer,
        explanation: `${question.answer.explanation} Dúvidas: (11) 98765-4321.`,
      },
    })),
  ),
  contentCase(
    "external_link",
    mathPracticeWith("p2", (question) => ({
      ...question,
      statement: `${question.statement} Veja mais em www.exemplo.com.br.`,
    })),
  ),
  contentCase(
    "blocked_term",
    mathPracticeWith("p2", (question) => ({
      ...question,
      statement: `${question.statement} Não seja babaca.`,
    })),
  ),
  contentCase(
    "duplicate_question",
    mathPracticeWith("p4", (question) => ({
      ...question,
      statement: math.content.practiceQuestionList[1]?.statement ?? question.statement,
    })),
  ),
  contentCase(
    "math_markup_invalid",
    mathPracticeWith("p2", withStatement("Calcule \\(3 + 4 e escreva o resultado no caderno.")),
    math,
    "math_markup_invalid sem par (core)",
  ),
  contentCase(
    "math_markup_invalid",
    mathPracticeWith("p2", withStatement("Calcule \\(\\frac{3}{\\) e escreva o resultado.")),
    math,
    "math_markup_invalid que o KaTeX recusa (worker)",
  ),
  contentCase(
    "markup_forbidden",
    mathPracticeWith("p2", withStatement("Calcule **agora** o total pedido na questão.")),
  ),
  {
    code: "review_answer_mismatch",
    fixture: math,
    repair: "item",
    arrange: reviewWith(math, (review) => ({
      ...review,
      itemReviewList: review.itemReviewList.map((item) =>
        item.itemId === "p1" ? { ...item, independentAnswer: "letra B" } : item,
      ),
    })),
  },
  itemReviewCase("review_answer_incorrect", "answer_incorrect", "p2"),
  itemReviewCase("review_answer_ambiguous", "answer_ambiguous", "p2"),
  itemReviewCase("review_explanation_inconsistent", "explanation_inconsistent", "p2"),
  itemReviewCase("review_missing_data", "missing_data", "p2"),
  itemReviewCase("review_off_topic", "off_topic", "p2"),
  itemReviewCase("review_above_grade", "above_grade", "p2"),
  itemReviewCase("review_inappropriate_content", "inappropriate_content", "p2"),
  itemReviewCase("review_personal_data", "personal_data", "p2"),
  itemReviewCase("review_evidence_unsupported", "evidence_unsupported", "p1", portuguese),
  itemReviewCase("review_example_incorrect", "example_incorrect", "e1"),
  kitReviewCase(
    "review_kit_section_incorrect",
    { code: "section_incorrect", targetId: "ma5-fractions", note: kitIssueNote },
    "item",
  ),
  kitReviewCase(
    "review_kit_base_text_inappropriate",
    { code: "base_text_inappropriate", targetId: "t1", note: kitIssueNote },
    "item",
    portuguese,
  ),
  kitReviewCase(
    "review_kit_off_topic",
    { code: "off_topic", targetId: null, note: kitIssueNote },
    "kit",
  ),
  kitReviewCase(
    "review_kit_above_grade",
    { code: "above_grade", targetId: null, note: kitIssueNote },
    "kit",
  ),
  kitReviewCase(
    "review_kit_inappropriate_content",
    { code: "inappropriate_content", targetId: null, note: kitIssueNote },
    "kit",
  ),
  kitReviewCase(
    "review_kit_personal_data",
    { code: "personal_data", targetId: null, note: kitIssueNote },
    "kit",
  ),
];

const blockerCodeOutsideTableList: readonly ValidationIssueCode[] = [
  "other_topic_unfeasible",
  "topic_coverage_below_minimum",
  "difficulty_distribution_mismatch",
];

describe("uma fixture defeituosa por bloqueador (spec F1-07, RF-04, pronto quando)", () => {
  it("a tabela cobre todo bloqueador de plano, validação e revisão", () => {
    const pipelineBlockerList = validationIssueCodeList.filter((code) => {
      const rule = validationIssueRuleMap[code];
      return rule.severity === "blocker" && rule.stage !== "render";
    });
    const coveredSet = new Set([
      ...blockerCaseList.map((blockerCase) => blockerCase.code),
      ...blockerCodeOutsideTableList,
    ]);
    expect(pipelineBlockerList.filter((code) => !coveredSet.has(code))).toEqual([]);
  });

  for (const blockerCase of blockerCaseList) {
    it(`${blockerCase.name ?? blockerCase.code} dispara na primeira tentativa e regenera com reparo ${blockerCase.repair}`, async () => {
      const { fixture } = blockerCase;
      const aiProvider = createFixtureAiProvider(fixture);
      blockerCase.arrange(aiProvider);
      const result = await generateKit(
        requestOf(fixture.studyKit.subject),
        dependenciesOf(aiProvider, fixture),
      );
      if (!result.ok) throw new Error(`falhou com ${result.error.code}`);
      const [first, second] = result.value.attemptList;
      expect(
        first?.issueList.some(
          (issue) => issue.code === blockerCase.code && issue.severity === "blocker",
        ),
      ).toBe(true);
      expect(second?.repair).toBe(blockerCase.repair);
      expect(validationIssueRuleMap[blockerCase.code].repair).toBe(blockerCase.repair);
      expect(result.value.attemptList).toHaveLength(2);
    });
  }
});

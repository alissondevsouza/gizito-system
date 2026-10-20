import { describe, expect, it } from "bun:test";
import {
  buildMathFixture,
  buildPortugueseFixture,
} from "#src/__tests__/__fixtures__/kit-content.ts";
import { listStudyQuestion } from "#src/pedagogy/kit/answer-key.ts";
import type { StudyKit } from "#src/pedagogy/kit/schemas.ts";
import type { ReviewedItemId } from "#src/pedagogy/kit-item.ts";
import {
  fullReviewItemIdList,
  interpretReview,
  normalizeAnswerLetter,
} from "#src/pedagogy/review/interpret.ts";
import type { ItemReview, ReviewResult } from "#src/pedagogy/review/schemas.ts";

const math = buildMathFixture();
const portuguese = buildPortugueseFixture();

function correctAnswerOf(itemId: ReviewedItemId): string {
  const question = listStudyQuestion(math.studyKit).find((item) => item.questionId === itemId);
  return question?.answer.correctOptionLabel ?? "resposta curta";
}

function buildReview(
  change: (itemReview: ItemReview) => ItemReview = (item) => item,
): ReviewResult {
  return {
    itemReviewList: fullReviewItemIdList.map((itemId) =>
      change({ itemId, independentAnswer: correctAnswerOf(itemId), issueList: [] }),
    ),
    kitIssueList: [],
  };
}

function interpret(
  output: unknown,
  studyKit: StudyKit = math.studyKit,
  itemIdList: readonly ReviewedItemId[] = fullReviewItemIdList,
) {
  return interpretReview(output, { studyKit, reviewedItemIdList: itemIdList });
}

describe("normalizeAnswerLetter (spec pedagógica §8.5)", () => {
  it.each(["B", "b", "b)", "(B)", "letra B", "alternativa B", " B. "])("%s vale B", (answer) => {
    expect(normalizeAnswerLetter(answer)).toBe("B");
  });

  it.each(["A ou B", "E", "", "a resposta é B", "BC"])("%s não é letra válida", (answer) => {
    expect(normalizeAnswerLetter(answer)).toBeNull();
  });
});

describe("interpretReview (spec pedagógica §8.5 e §9)", () => {
  it("revisão sem achado e com a letra certa não gera código", () => {
    expect(fullReviewItemIdList).toHaveLength(22);
    expect(interpret(buildReview())).toEqual({ ok: true, value: [] });
  });

  it("letra diferente da correta vira review_answer_mismatch", () => {
    const result = interpret(
      buildReview((item) =>
        item.itemId === "p1" ? { ...item, independentAnswer: "letra D" } : item,
      ),
    );
    expect(result).toEqual({
      ok: true,
      value: [
        {
          code: "review_answer_mismatch",
          severity: "blocker",
          stage: "review",
          itemId: "p1",
          note: null,
          excerpt: null,
        },
      ],
    });
  });

  it("códigos de item e de kit ganham prefixo, severidade do mapa e nota", () => {
    const result = interpret({
      ...buildReview((item) =>
        item.itemId === "m2"
          ? {
              ...item,
              issueList: [
                { code: "missing_data", note: "falta o preço da bala" },
                { code: "weak_distractor", note: "distrator fácil demais" },
              ],
            }
          : item,
      ),
      kitIssueList: [
        { code: "section_incorrect", targetId: "ma5-fractions", note: "regra trocada na revisão" },
        { code: "style_mismatch", targetId: null, note: "linguagem formal demais" },
        { code: "off_topic", targetId: "ma5-volume", note: "foge dos assuntos pedidos" },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.value.map((issue) => [issue.code, issue.severity, issue.itemId, issue.note]),
    ).toEqual([
      ["review_missing_data", "blocker", "m2", "falta o preço da bala"],
      ["review_weak_distractor", "warning", "m2", "distrator fácil demais"],
      ["review_kit_section_incorrect", "blocker", "ma5-fractions", "regra trocada na revisão"],
      ["review_kit_style_mismatch", "warning", null, "linguagem formal demais"],
      ["review_kit_off_topic", "blocker", null, "foge dos assuntos pedidos"],
    ]);
  });

  it("revisão de reparo confere exatamente os itens refeitos, na ordem", () => {
    const repairReview = {
      itemReviewList: [
        { itemId: "p2", independentAnswer: "44", issueList: [] },
        { itemId: "e1", independentAnswer: "42", issueList: [] },
      ],
      kitIssueList: [],
    };
    expect(interpret(repairReview, math.studyKit, ["p2", "e1"]).ok).toBe(true);
    expect(interpret(repairReview, math.studyKit, ["e1", "p2"]).ok).toBe(false);
    expect(interpret({ itemReviewList: [], kitIssueList: [] }, math.studyKit, []).ok).toBe(true);
  });

  it.each<[string, unknown]>([
    ["fora do schema", { ...buildReview(), extra: true }],
    ["item faltando", { ...buildReview(), itemReviewList: buildReview().itemReviewList.slice(1) }],
    [
      "itens fora de ordem",
      { ...buildReview(), itemReviewList: [...buildReview().itemReviewList].reverse() },
    ],
    [
      "letra inválida em múltipla escolha",
      buildReview((item) =>
        item.itemId === "p1" ? { ...item, independentAnswer: "A ou B" } : item,
      ),
    ],
    [
      "letra E",
      buildReview((item) => (item.itemId === "p1" ? { ...item, independentAnswer: "E" } : item)),
    ],
    [
      "section_incorrect sem targetId",
      {
        ...buildReview(),
        kitIssueList: [{ code: "section_incorrect", targetId: null, note: "errada" }],
      },
    ],
    [
      "section_incorrect de assunto fora do kit",
      {
        ...buildReview(),
        kitIssueList: [{ code: "section_incorrect", targetId: "ma5-volume", note: "errada" }],
      },
    ],
    [
      "base_text_inappropriate de texto inexistente",
      {
        ...buildReview(),
        kitIssueList: [{ code: "base_text_inappropriate", targetId: "t1", note: "texto difícil" }],
      },
    ],
  ])("review_output_invalid: %s", (_, output) => {
    expect(interpret(output)).toEqual({ ok: false, error: { code: "review_output_invalid" } });
  });

  it("base_text_inappropriate com texto do kit aponta o texto-base", () => {
    const review = {
      itemReviewList: fullReviewItemIdList.map((itemId) => {
        const question = listStudyQuestion(portuguese.studyKit).find(
          (item) => item.questionId === itemId,
        );
        return {
          itemId,
          independentAnswer: question?.answer.correctOptionLabel ?? "resposta",
          issueList: [],
        };
      }),
      kitIssueList: [
        { code: "base_text_inappropriate", targetId: "t2", note: "vocabulário difícil" },
      ],
    };
    const result = interpret(review, portuguese.studyKit);
    expect(result.ok && result.value.map((issue) => [issue.code, issue.itemId])).toEqual([
      ["review_kit_base_text_inappropriate", "t2"],
    ]);
  });
});

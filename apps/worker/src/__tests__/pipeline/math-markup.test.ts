import { describe, expect, it } from "bun:test";
import type { MathStudyKit } from "@gizito/core";
import { buildMathFixture } from "@gizito/core/testing";
import { isKatexParsable } from "@gizito/integrations";
import { checkMathMarkup } from "#src/pipeline/math-markup.ts";

const fixture = buildMathFixture();

function editKit(edit: (studyKit: MathStudyKit) => MathStudyKit): MathStudyKit {
  return edit(structuredClone(fixture.studyKit));
}

function withStatement(questionIndex: number, statement: string): MathStudyKit {
  return editKit((studyKit) => ({
    ...studyKit,
    practiceQuestionList: studyKit.practiceQuestionList.map((question, index) =>
      index === questionIndex ? { ...question, statement } : question,
    ),
  }));
}

describe("checkMathMarkup (spec F1-07, RF-02)", () => {
  it("o kit da fixture com marcação válida não gera código", () => {
    const studyKit = withStatement(
      0,
      "Calcule \\(\\frac{1}{2} + \\frac{1}{4}\\), depois \\(2,5 \\times 3\\) e \\(25\\%\\) de 40.",
    );
    expect(checkMathMarkup(studyKit, isKatexParsable)).toEqual([]);
  });

  it("trecho que o KaTeX não analisa vira math_markup_invalid com o item e o trecho", () => {
    const studyKit = withStatement(2, "Quanto é \\(\\frac{3}{\\) da turma de 24 alunos?");
    expect(checkMathMarkup(studyKit, isKatexParsable)).toEqual([
      {
        code: "math_markup_invalid",
        severity: "blocker",
        stage: "validate",
        itemId: "p3",
        note: null,
        excerpt: "\\frac{3}{",
      },
    ]);
  });

  it("um código por item, mesmo com vários trechos inválidos", () => {
    const studyKit = withStatement(
      0,
      "Calcule \\(\\fracc{1}{2}\\) e depois \\(x^{\\) com cuidado.",
    );
    expect(checkMathMarkup(studyKit, isKatexParsable).map((issue) => issue.itemId)).toEqual(["p1"]);
  });

  it("delimitador sem par fica com o core e não é analisado aqui", () => {
    const studyKit = withStatement(0, "Calcule \\(\\frac{1}{2} sem fechar a marcação.");
    expect(checkMathMarkup(studyKit, isKatexParsable)).toEqual([]);
  });

  it("trecho inválido na dica do mascote e no rótulo do outro sai com itemId nulo", () => {
    const studyKit = editKit((kit) => ({
      ...kit,
      studyTip: "Confira a conta \\(\\frac{1}{\\) antes de passar para a próxima.",
      topicList: kit.topicList.map((topic) =>
        topic.topicRef === "other" ? { ...topic, label: "Troco \\(x^{\\)" } : topic,
      ),
    }));
    expect(checkMathMarkup(studyKit, isKatexParsable)).toEqual([
      expect.objectContaining({ code: "math_markup_invalid", itemId: null }),
    ]);
  });

  it("confere tabela, alternativa, passo e explicação", () => {
    const studyKit = editKit((kit) => ({
      ...kit,
      workedExampleList: kit.workedExampleList.map((example, index) =>
        index === 1
          ? {
              ...example,
              stepList: [...example.stepList.slice(0, 1), "Multiplicar \\(8 \\timez 5\\)."],
            }
          : example,
      ),
      mockQuestionList: kit.mockQuestionList.map((question, index) =>
        index === 4
          ? {
              ...question,
              answer: {
                ...question.answer,
                explanation: "A conta é \\(\\frac{\\) e dá o total pedido.",
              },
            }
          : question,
      ),
    }));
    expect(checkMathMarkup(studyKit, isKatexParsable).map((issue) => issue.itemId)).toEqual([
      "e2",
      "m5",
    ]);
  });
});

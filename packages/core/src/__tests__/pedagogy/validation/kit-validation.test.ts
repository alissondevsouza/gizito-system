import { describe, expect, it } from "bun:test";
import {
  buildMathFixture,
  buildPortugueseFixture,
} from "#src/__tests__/__fixtures__/kit-content.ts";
import type { MathEvaluator } from "#src/interfaces/math-evaluator.ts";
import type { ExpectedAnswer } from "#src/pedagogy/expected-answer.ts";
import { type StudyKit, studyKitSchema } from "#src/pedagogy/kit/schemas.ts";
import { countKitWord, jaccardSimilarity } from "#src/pedagogy/validation/content.ts";
import { validateStudyKit } from "#src/pedagogy/validation/index.ts";
import { ok } from "#src/result.ts";

const math = buildMathFixture();
const portuguese = buildPortugueseFixture();

type JsonRecord = Record<string, unknown>;

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function listAt(record: JsonRecord, key: string): JsonRecord[] {
  return record[key] as JsonRecord[];
}

function at(record: JsonRecord, key: string): JsonRecord {
  return record[key] as JsonRecord;
}

function itemOf(kit: JsonRecord, itemId: string): JsonRecord {
  const listKey = itemId.startsWith("p")
    ? "practiceQuestionList"
    : itemId.startsWith("m")
      ? "mockQuestionList"
      : itemId.startsWith("e")
        ? "workedExampleList"
        : "baseTextList";
  const idKey = itemId.startsWith("e")
    ? "exampleId"
    : itemId.startsWith("t")
      ? "baseTextId"
      : "questionId";
  const item = listAt(kit, listKey).find((candidate) => candidate[idKey] === itemId);
  if (item === undefined) throw new Error(`fixture has no ${itemId}`);
  return item;
}

function editKit(studyKit: StudyKit, edit: (kit: JsonRecord) => void): StudyKit {
  const kit = cloneJson(studyKit) as unknown as JsonRecord;
  edit(kit);
  return studyKitSchema.parse(kit);
}

function withEvaluation(
  base: MathEvaluator,
  expression: string,
  value: ExpectedAnswer,
): MathEvaluator {
  return {
    evaluate: (candidate) => (candidate === expression ? ok(value) : base.evaluate(candidate)),
    equals: base.equals,
  };
}

function issuesOf(studyKit: StudyKit, mathEvaluator: MathEvaluator = math.mathEvaluator) {
  return validateStudyKit(studyKit, { mathEvaluator }).map((issue) => ({
    code: issue.code,
    itemId: issue.itemId,
    excerpt: issue.excerpt,
  }));
}

function codeItemListOf(studyKit: StudyKit, mathEvaluator?: MathEvaluator) {
  return issuesOf(studyKit, mathEvaluator).map((issue) => [issue.code, issue.itemId]);
}

const editMath = (edit: (kit: JsonRecord) => void) => editKit(math.studyKit, edit);
const editPortuguese = (edit: (kit: JsonRecord) => void) => editKit(portuguese.studyKit, edit);

describe("validateStudyKit: kits válidos", () => {
  it("as fixtures de Matemática e de Português não geram código nenhum", () => {
    expect(issuesOf(math.studyKit)).toEqual([]);
    expect(issuesOf(portuguese.studyKit, portuguese.mathEvaluator)).toEqual([]);
  });
});

describe("validateStudyKit: estrutura e respostas (spec pedagógica §8.2)", () => {
  it("topic_coverage_below_minimum", () => {
    const kit = editMath((draft) => {
      const question = listAt(draft, "practiceQuestionList").find(
        (item) => item.topicRef === "other",
      );
      if (question) question.topicRef = "ma5-fractions";
    });
    expect(codeItemListOf(kit)).toEqual([["topic_coverage_below_minimum", "other"]]);
  });

  it("difficulty_distribution_mismatch", () => {
    const kit = editMath((draft) => {
      itemOf(draft, "p1").difficulty = "hard";
    });
    expect(codeItemListOf(kit)).toEqual([["difficulty_distribution_mismatch", null]]);
  });

  it("correct_option_mismatch em Matemática e em Português", () => {
    const mathKit = editMath((draft) => {
      at(itemOf(draft, "p1"), "answer").correctOptionLabel = "B";
    });
    expect(codeItemListOf(mathKit)).toEqual([["correct_option_mismatch", "p1"]]);
    const portugueseKit = editPortuguese((draft) => {
      at(at(itemOf(draft, "p5"), "answer"), "expectedAnswer").value = "fechou";
    });
    expect(codeItemListOf(portugueseKit)).toEqual([["correct_option_mismatch", "p5"]]);
  });

  it("correta 0,5 com expectedAnswer 1/2 não é correct_option_mismatch", () => {
    const evaluator = withEvaluation(math.mathEvaluator, "1 / 2", {
      kind: "fraction",
      numerator: 1,
      denominator: 2,
      unit: null,
    });
    const kit = editMath((draft) => {
      const question = itemOf(draft, "p1");
      question.statement = "Ana dividiu 1 bolo em 2 partes iguais. Que parte cada pessoa recebeu?";
      const answer = at(question, "answer");
      answer.calculationExpression = "1 / 2";
      answer.expectedAnswer = { kind: "fraction", numerator: 1, denominator: 2, unit: null };
      const optionList = question.optionList as JsonRecord[];
      const correct = optionList.find((option) => option.label === answer.correctOptionLabel);
      if (correct) correct.value = { kind: "number", value: 0.5, unit: null, tolerance: 0 };
    });
    expect(codeItemListOf(kit, evaluator)).toEqual([]);
  });

  it("distractor_equivalent por equals em Matemática e por espaços em Português", () => {
    const mathKit = editMath((draft) => {
      const question = itemOf(draft, "p1");
      const answer = at(question, "answer");
      const value = at(answer, "expectedAnswer").value as number;
      const distractor = (question.optionList as JsonRecord[]).find(
        (option) => option.label !== answer.correctOptionLabel,
      );
      if (distractor)
        distractor.value = { kind: "fraction", numerator: value * 2, denominator: 2, unit: null };
    });
    expect(codeItemListOf(mathKit)).toEqual([["distractor_equivalent", "p1"]]);
    const portugueseKit = editPortuguese((draft) => {
      const question = itemOf(draft, "p1");
      const answer = at(question, "answer");
      const distractor = (question.optionList as JsonRecord[]).find(
        (option) => option.label !== answer.correctOptionLabel,
      );
      if (distractor) distractor.text = "  Até a beira   do rio. ";
    });
    expect(codeItemListOf(portugueseKit)).toEqual([["distractor_equivalent", "p1"]]);
  });

  it("option_duplicate", () => {
    const kit = editMath((draft) => {
      const question = itemOf(draft, "p1");
      const answer = at(question, "answer");
      const [first, second] = (question.optionList as JsonRecord[]).filter(
        (option) => option.label !== answer.correctOptionLabel,
      );
      if (first && second) second.value = first.value;
    });
    expect(codeItemListOf(kit)).toEqual([["option_duplicate", "p1"]]);
  });

  it("Português mantém acento, maiúscula e pontuação nas alternativas", () => {
    const kit = editPortuguese((draft) => {
      const question = itemOf(draft, "p5");
      question.statement = "Qual palavra completa a frase: O livro ______ na mesa?";
      const answer = at(question, "answer");
      at(answer, "expectedAnswer").value = "está";
      const textList = ["está", "esta", "Está", "está."];
      const optionList = question.optionList as JsonRecord[];
      const correctIndex = optionList.findIndex(
        (option) => option.label === answer.correctOptionLabel,
      );
      [textList[0], textList[correctIndex]] = [textList[correctIndex] ?? "", textList[0] ?? ""];
      optionList.forEach((option, index) => {
        option.text = textList[index];
      });
    });
    expect(codeItemListOf(kit)).toEqual([]);
  });

  it("math_recalculation_mismatch com unidade comparada", () => {
    const kit = editMath((draft) => {
      const expected = at(at(itemOf(draft, "p6"), "answer"), "expectedAnswer");
      expected.unit = "cm²";
    });
    expect(codeItemListOf(kit)).toEqual([["math_recalculation_mismatch", "p6"]]);
  });

  it("math_expression_invalid", () => {
    const kit = editMath((draft) => {
      at(itemOf(draft, "p2"), "answer").calculationExpression = "4 * * 11";
    });
    expect(codeItemListOf(kit)).toEqual([["math_expression_invalid", "p2"]]);
  });

  it("math_expression_invalid em resposta expression que o avaliador não aceita, uma vez por item", () => {
    const kit = editMath((draft) => {
      const answer = at(itemOf(draft, "p2"), "answer");
      answer.expectedAnswer = { kind: "expression", expression: "2x +" };
    });
    expect(codeItemListOf(kit)).toEqual([["math_expression_invalid", "p2"]]);
  });

  it("math_expression_invalid sai uma vez com cálculo e resposta inválidos no mesmo item", () => {
    const kit = editMath((draft) => {
      const answer = at(itemOf(draft, "p2"), "answer");
      answer.calculationExpression = "4 * * 11";
      answer.expectedAnswer = { kind: "expression", expression: "2x +" };
    });
    expect(codeItemListOf(kit)).toEqual([["math_expression_invalid", "p2"]]);
  });

  it("math_expression_invalid em alternativa expression que o avaliador não aceita", () => {
    let questionId = "";
    const kit = editMath((draft) => {
      const question = listAt(draft, "practiceQuestionList").find(
        (candidate) => candidate.optionList !== null,
      );
      if (question === undefined) throw new Error("fixture has no multiple choice");
      questionId = String(question.questionId);
      const answer = at(question, "answer");
      const distractor = listAt(question, "optionList").find(
        (option) => option.label !== answer.correctOptionLabel,
      );
      if (distractor === undefined) throw new Error("fixture has no distractor");
      distractor.value = { kind: "expression", expression: "2x +" };
    });
    expect(codeItemListOf(kit)).toEqual([["math_expression_invalid", questionId]]);
  });

  it("resposta expression que o avaliador aceita, sem cálculo, não gera código", () => {
    const kit = editMath((draft) => {
      const answer = at(itemOf(draft, "p2"), "answer");
      answer.expectedAnswer = { kind: "expression", expression: "2 * x + 1" };
      answer.computable = false;
      answer.calculationExpression = null;
    });
    const evaluator = withEvaluation(math.mathEvaluator, "2 * x + 1", {
      kind: "expression",
      expression: "2 * x + 1",
    });
    expect(codeItemListOf(kit, evaluator)).toEqual([]);
  });

  it("example_recalculation_mismatch", () => {
    const kit = editMath((draft) => {
      at(at(itemOf(draft, "e1"), "answer"), "expectedAnswer").value = 43;
    });
    expect(codeItemListOf(kit)).toEqual([["example_recalculation_mismatch", "e1"]]);
  });

  it("non_computable_excess com 7 questões sem cálculo", () => {
    const kit = editMath((draft) => {
      for (const questionId of ["p2", "p4", "p6", "p8", "p10", "m2", "m4"]) {
        const answer = at(itemOf(draft, questionId), "answer");
        answer.computable = false;
        answer.calculationExpression = null;
      }
    });
    expect(codeItemListOf(kit)).toEqual([["non_computable_excess", null]]);
  });

  it("expression_number_not_in_statement, com números em pt-BR e frações no enunciado", () => {
    const evaluator = withEvaluation(math.mathEvaluator, "1250 * 3 / 4", {
      kind: "number",
      value: 937.5,
      unit: null,
      tolerance: 0,
    });
    const coveredKit = editMath((draft) => {
      const question = itemOf(draft, "p2");
      question.statement =
        "Uma bicicleta custa 1.250 reais e Ana pagou \\(\\frac{3}{4}\\) do preço. Quanto ela pagou?";
      const answer = at(question, "answer");
      answer.calculationExpression = "1250 * 3 / 4";
      answer.expectedAnswer = { kind: "number", value: 937.5, unit: null, tolerance: 0 };
    });
    expect(codeItemListOf(coveredKit, evaluator)).toEqual([]);
    const conversionEvaluator = withEvaluation(math.mathEvaluator, "3 * 4 * 7", {
      kind: "number",
      value: 84,
      unit: null,
      tolerance: 0,
    });
    const conversionKit = editMath((draft) => {
      const answer = at(itemOf(draft, "p1"), "answer");
      answer.calculationExpression = "3 * 4 * 7";
    });
    expect(codeItemListOf(conversionKit, conversionEvaluator)).toEqual([
      ["math_recalculation_mismatch", "p1"],
    ]);
    expect(
      issuesOf(conversionKit, conversionEvaluator).some(
        (issue) => issue.code === "expression_number_not_in_statement",
      ),
    ).toBe(false);
    const missingEvaluator = withEvaluation(math.mathEvaluator, "4 * 11 * 2", {
      kind: "number",
      value: 88,
      unit: null,
      tolerance: 0,
    });
    const missingKit = editMath((draft) => {
      const answer = at(itemOf(draft, "p2"), "answer");
      answer.calculationExpression = "4 * 11 * 2";
      at(answer, "expectedAnswer").value = 88;
    });
    expect(issuesOf(missingKit, missingEvaluator)).toEqual([
      { code: "expression_number_not_in_statement", itemId: "p2", excerpt: "2" },
    ]);
  });

  it("fraction_not_simplified", () => {
    const kit = editMath((draft) => {
      const answer = at(itemOf(draft, "p2"), "answer");
      answer.computable = false;
      answer.calculationExpression = null;
      answer.expectedAnswer = { kind: "fraction", numerator: 2, denominator: 4, unit: null };
    });
    expect(codeItemListOf(kit)).toEqual([["fraction_not_simplified", "p2"]]);
  });

  it("unit_missing só em assunto com measurement_unit, nunca no outro", () => {
    const withoutUnit = (questionId: string) =>
      editMath((draft) => {
        const answer = at(itemOf(draft, questionId), "answer");
        answer.computable = false;
        answer.calculationExpression = null;
        at(answer, "expectedAnswer").unit = null;
      });
    expect(itemOf(cloneJson(math.studyKit) as unknown as JsonRecord, "p6").topicRef).toBe(
      "ma5-perimeter-area",
    );
    expect(codeItemListOf(withoutUnit("p6"))).toEqual([["unit_missing", "p6"]]);
    expect(itemOf(cloneJson(math.studyKit) as unknown as JsonRecord, "p8").topicRef).toBe("other");
    expect(codeItemListOf(withoutUnit("p8"))).toEqual([]);
  });

  it("evidence_quote_not_found, e citação entre aspas ou com espaços diferentes é encontrada", () => {
    const missingKit = editPortuguese((draft) => {
      at(itemOf(draft, "p1"), "answer").evidenceQuote = "o jabuti voou até a lua";
    });
    expect(codeItemListOf(missingKit)).toEqual([["evidence_quote_not_found", "p1"]]);
    const quotedKit = editPortuguese((draft) => {
      at(itemOf(draft, "p1"), "answer").evidenceQuote =
        "“Na primeira manhã,   o jabuti caminhou até a beira do rio”";
    });
    expect(codeItemListOf(quotedKit)).toEqual([]);
  });
});

describe("validateStudyKit: conteúdo (spec pedagógica §8.3)", () => {
  it("figure_reference no enunciado, nunca em explicação, revisão ou texto-base", () => {
    const kit = editPortuguese((draft) => {
      const question = itemOf(draft, "m1");
      question.statement = `Observe a figura abaixo. ${question.statement}`;
      at(itemOf(draft, "p2"), "answer").explanation =
        "Veja o desenho ao lado e observe a figura abaixo.";
      const section = listAt(draft, "reviewSectionList")[0];
      if (section)
        section.paragraphList = ["Observe a figura abaixo para lembrar a ideia principal."];
      const baseText = itemOf(draft, "t1");
      baseText.title = "Veja a imagem";
    });
    expect(issuesOf(kit, portuguese.mathEvaluator)).toEqual([
      { code: "figure_reference", itemId: "m1", excerpt: "Observe a figura" },
    ]);
  });

  it("figure_reference também em tabela, alternativa e exemplo", () => {
    const kit = editPortuguese((draft) => {
      itemOf(draft, "p5").table = {
        headerList: ["Coluna", "Observe o gráfico"],
        rowList: [["linha", "valor"]],
      };
      const option = (itemOf(draft, "p7").optionList as JsonRecord[])[3];
      if (option) option.text = "Veja o desenho ao lado.";
      const example = itemOf(draft, "e1");
      example.statement = `Olhe a ilustração. ${example.statement as string}`;
      itemOf(draft, "e2").table = {
        headerList: ["Palavra", "Na figura abaixo"],
        rowList: [["esperto", "sabido"]],
      };
    });
    expect(issuesOf(kit, portuguese.mathEvaluator)).toEqual([
      { code: "figure_reference", itemId: "e1", excerpt: "Olhe a ilustração" },
      { code: "figure_reference", itemId: "e2", excerpt: "Na figura abaixo" },
      { code: "figure_reference", itemId: "p5", excerpt: "Observe o gráfico" },
      { code: "figure_reference", itemId: "p7", excerpt: "Veja o desenho" },
    ]);
  });

  it("personal_data_pattern em explicação e no rótulo do outro, com itemId nulo no rótulo", () => {
    const kit = editMath((draft) => {
      at(itemOf(draft, "p2"), "answer").explanation =
        "Para dúvidas, ligue (11) 98765-4321 depois da aula.";
      const other = listAt(draft, "topicList")[2];
      if (other) other.label = "Troco 21 3456-7890";
    });
    expect(issuesOf(kit)).toEqual([
      { code: "personal_data_pattern", itemId: null, excerpt: "21 3456-7890" },
      { code: "personal_data_pattern", itemId: "p2", excerpt: "(11) 98765-4321" },
    ]);
  });

  it("external_link na revisão leva o topicRef da seção", () => {
    const kit = editMath((draft) => {
      const section = listAt(draft, "reviewSectionList")[1];
      if (section) section.paragraphList = ["Saiba mais em www.site.com.br sobre áreas e medidas."];
    });
    expect(issuesOf(kit)).toEqual([
      { code: "external_link", itemId: "ma5-perimeter-area", excerpt: "www.site.com.br" },
    ]);
  });

  it("blocked_term na dica do mascote, com itemId nulo", () => {
    const kit = editMath((draft) => {
      draft.studyTip = "Não deixe a conta virar uma merda, confira tudo.";
    });
    expect(issuesOf(kit)).toEqual([{ code: "blocked_term", itemId: null, excerpt: "merda" }]);
  });

  it("duplicate_question", () => {
    const kit = editMath((draft) => {
      const source = itemOf(draft, "p1");
      const target = itemOf(draft, "p3");
      target.statement = source.statement;
      target.optionList = source.optionList;
      target.answer = source.answer;
    });
    expect(codeItemListOf(kit)).toEqual([["duplicate_question", "p3"]]);
  });

  it("math_markup_invalid", () => {
    const kit = editMath((draft) => {
      const question = itemOf(draft, "p2");
      question.statement = `${question.statement} Escreva como \\(\\frac{1}{2}.`;
    });
    expect(codeItemListOf(kit)).toEqual([["math_markup_invalid", "p2"]]);
  });

  it("markup_forbidden fora da marcação matemática", () => {
    const kit = editMath((draft) => {
      at(itemOf(draft, "p2"), "answer").explanation = "Preste **atenção** na conta de vezes.";
    });
    expect(issuesOf(kit)).toEqual([{ code: "markup_forbidden", itemId: "p2", excerpt: "**" }]);
  });

  it("similar_question", () => {
    const kit = editMath((draft) => {
      const source = itemOf(draft, "p1");
      const target = itemOf(draft, "p3");
      target.statement = `${source.statement as string} Explique a conta.`;
      target.optionList = source.optionList;
      target.answer = source.answer;
    });
    expect(codeItemListOf(kit)).toEqual([["similar_question", "p3"]]);
  });

  it("example_similar_to_question", () => {
    const kit = editMath((draft) => {
      const example = itemOf(draft, "e1");
      example.statement = `${itemOf(draft, "p1").statement as string} Mostre.`;
      const answer = at(example, "answer");
      answer.computable = false;
      answer.calculationExpression = null;
    });
    expect(codeItemListOf(kit)).toEqual([["example_similar_to_question", "e1"]]);
  });

  it("mock_hint só no simulado", () => {
    const kit = editMath((draft) => {
      const mock = itemOf(draft, "m3");
      mock.statement = `Lembre-se da tabuada. ${mock.statement as string}`;
      const practice = itemOf(draft, "p3");
      practice.statement = `Lembre-se da tabuada. ${practice.statement as string}`;
    });
    expect(issuesOf(kit)).toEqual([{ code: "mock_hint", itemId: "m3", excerpt: "Lembre-se" }]);
  });

  it("statement_too_long pelo ano, com marcação contando uma palavra", () => {
    const kit = editMath((draft) => {
      const question = itemOf(draft, "p2");
      question.statement = `${question.statement as string} ${"muito ".repeat(60).trim()}`;
    });
    expect(codeItemListOf(kit)).toEqual([["statement_too_long", "p2"]]);
    expect(countKitWord("Calcule \\(\\frac{3}{4} + \\frac{1}{4}\\) agora, R$ 12,50.")).toBe(5);
  });

  it("base_text_length pelo ano", () => {
    const kit = editPortuguese((draft) => {
      const baseText = itemOf(draft, "t1");
      baseText.paragraphList = (baseText.paragraphList as string[]).slice(0, 1);
    });
    expect(codeItemListOf(kit)).toEqual([["base_text_length", "t1"]]);
  });

  it("Jaccard das palavras normalizadas", () => {
    expect(jaccardSimilarity("Ana tem 3 lápis", "ana tem 3 lapis")).toBe(1);
    expect(jaccardSimilarity("um dois", "três quatro")).toBe(0);
  });
});

import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { OTHER_TOPIC_LABEL } from "#src/__tests__/__fixtures__/kit.ts";
import {
  buildMathFixture,
  buildPortugueseFixture,
  FIXTURE_MATERIAL_PROFILE,
  GENERATION_VERSION,
} from "#src/__tests__/__fixtures__/kit-content.ts";
import { ANSWER_KEY_COUNT } from "#src/constants.ts";
import type { Subject } from "#src/enums.ts";
import type { ExpectedAnswer } from "#src/pedagogy/expected-answer.ts";
import { photoExtractionSchema } from "#src/pedagogy/extraction/schemas.ts";
import { formatExpectedAnswer, listAnswerKey } from "#src/pedagogy/kit/answer-key.ts";
import {
  applyKitRepair,
  composeStudyKit,
  InvalidComposeInputError,
} from "#src/pedagogy/kit/compose.ts";
import {
  kitContentSchemaBySubject,
  kitRepairSchemaBySubject,
  studyKitSchema,
} from "#src/pedagogy/kit/schemas.ts";
import { listKitTextEntry } from "#src/pedagogy/kit/text.ts";
import { kitPlanSchema } from "#src/pedagogy/plan/schemas.ts";
import { reviewResultSchema } from "#src/pedagogy/review/schemas.ts";
import { createValidationIssue } from "#src/pedagogy/validation/issue.ts";

const math = buildMathFixture();
const portuguese = buildPortugueseFixture();

type JsonRecord = Record<string, unknown>;

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function editContent(subject: Subject, edit: (content: JsonRecord) => void): JsonRecord {
  const content = cloneJson(subject === "math" ? math.content : portuguese.content) as JsonRecord;
  edit(content);
  return content;
}

function listAt(record: JsonRecord, key: string): JsonRecord[] {
  return record[key] as JsonRecord[];
}

function at(record: JsonRecord, key: string): JsonRecord {
  return record[key] as JsonRecord;
}

function isContentValid(subject: Subject, content: unknown): boolean {
  return kitContentSchemaBySubject[subject].safeParse(content).success;
}

function compose(subject: Subject, content: unknown) {
  const fixture = subject === "math" ? math : portuguese;
  return composeStudyKit({
    content,
    kitSlotPlan: fixture.kitSlotPlan,
    plan: fixture.plan,
    grade: "5",
    subject,
    perceivedDifficulty: null,
    materialProfile: FIXTURE_MATERIAL_PROFILE,
    sourceWarningCodeList: [],
    generationVersion: GENERATION_VERSION,
  });
}

function codesOf(result: ReturnType<typeof compose>): readonly string[] {
  return result.ok ? [] : result.error.map((issue) => issue.code);
}

function firstQuestion(content: JsonRecord, listKey = "practiceQuestionList"): JsonRecord {
  const question = listAt(content, listKey)[0];
  if (question === undefined) throw new Error("fixture");
  return question;
}

describe("kitContentSchema por disciplina (spec pedagógica §7.1)", () => {
  it("fixtures válidas das duas disciplinas passam", () => {
    expect(isContentValid("math", math.content)).toBe(true);
    expect(isContentValid("portuguese", portuguese.content)).toBe(true);
  });

  it("texto-base aceita parágrafo curto, como saudação e assinatura de carta (spec pedagógica 1.5 §15.10)", () => {
    const withLetterEnding = editContent("portuguese", (content) => {
      const [baseText] = listAt(content, "baseTextList");
      if (baseText === undefined) throw new Error("fixture");
      baseText.paragraphList = [...(baseText.paragraphList as string[]), "Um abraço,", "Lia"];
    });
    expect(isContentValid("portuguese", withLetterEnding)).toBe(true);
    const withEmptyParagraph = editContent("portuguese", (content) => {
      const [baseText] = listAt(content, "baseTextList");
      if (baseText === undefined) throw new Error("fixture");
      baseText.paragraphList = [...(baseText.paragraphList as string[]), " "];
    });
    expect(isContentValid("portuguese", withEmptyParagraph)).toBe(false);
  });

  it.each<[string, Subject, (content: JsonRecord) => void]>([
    ["9 questões", "math", (content) => listAt(content, "practiceQuestionList").pop()],
    [
      "3 alternativas",
      "math",
      (content) => (at(firstQuestion(content), "optionList") as unknown as unknown[]).pop(),
    ],
    [
      "rótulos fora de ordem",
      "math",
      (content) => {
        const optionList = firstQuestion(content).optionList as JsonRecord[];
        const [first, second] = optionList;
        if (first && second) [first.label, second.label] = [second.label, first.label];
      },
    ],
    [
      "rótulo E",
      "portuguese",
      (content) => {
        const optionList = firstQuestion(content).optionList as JsonRecord[];
        const last = optionList[3];
        if (last) last.label = "E";
      },
    ],
    [
      "correctOptionLabel sem optionList",
      "math",
      (content) => {
        firstQuestion(content).optionList = null;
      },
    ],
    [
      "optionList sem correctOptionLabel",
      "math",
      (content) => {
        at(firstQuestion(content), "answer").correctOptionLabel = null;
      },
    ],
    [
      "computable sem expressão",
      "math",
      (content) => {
        at(firstQuestion(content), "answer").calculationExpression = null;
      },
    ],
    [
      "expressão sem computable",
      "math",
      (content) => {
        at(firstQuestion(content), "answer").computable = false;
      },
    ],
    [
      "computable com resposta set",
      "math",
      (content) => {
        const question = listAt(content, "practiceQuestionList")[1];
        if (question)
          at(question, "answer").expectedAnswer = { kind: "set", valueList: ["1", "2"] };
      },
    ],
    [
      "Português com resposta number",
      "portuguese",
      (content) => {
        at(firstQuestion(content), "answer").expectedAnswer = {
          kind: "number",
          value: 1,
          unit: null,
          tolerance: 0,
        };
      },
    ],
    [
      "Português computable",
      "portuguese",
      (content) => {
        at(firstQuestion(content), "answer").computable = true;
      },
    ],
    [
      "Matemática com evidenceQuote",
      "math",
      (content) => {
        at(firstQuestion(content), "answer").evidenceQuote = "um trecho qualquer";
      },
    ],
    [
      "exemplo com correctOptionLabel",
      "math",
      (content) => {
        const example = listAt(content, "workedExampleList")[0];
        if (example) at(example, "answer").correctOptionLabel = "A";
      },
    ],
    [
      "exemplo de Português com evidenceQuote",
      "portuguese",
      (content) => {
        const example = listAt(content, "workedExampleList")[0];
        if (example) at(example, "answer").evidenceQuote = "um trecho do exemplo";
      },
    ],
    [
      "exemplo de Português com correctOptionLabel",
      "portuguese",
      (content) => {
        const example = listAt(content, "workedExampleList")[1];
        if (example) at(example, "answer").correctOptionLabel = "B";
      },
    ],
    [
      "expectedAnswer com chave a mais",
      "math",
      (content) => {
        at(at(firstQuestion(content), "answer"), "expectedAnswer").note = "extra";
      },
    ],
    [
      "mockSuggestedMinutes 19",
      "math",
      (content) => {
        content.mockSuggestedMinutes = 19;
      },
    ],
    [
      "mockSuggestedMinutes 61",
      "math",
      (content) => {
        content.mockSuggestedMinutes = 61;
      },
    ],
    [
      "questão de fixação com id de simulado",
      "math",
      (content) => {
        firstQuestion(content).questionId = "m1";
      },
    ],
    [
      "texto-base em Matemática",
      "math",
      (content) => {
        content.baseTextList = [
          { baseTextId: "t1", title: "Um texto", paragraphList: ["Um parágrafo qualquer."] },
        ];
      },
    ],
    ["chave a mais", "portuguese", (content) => Object.assign(content, { extra: true })],
  ])("recusa %s", (_, subject, edit) => {
    expect(isContentValid(subject, editContent(subject, edit))).toBe(false);
  });

  it.each<Subject>(["math", "portuguese"])(
    "o JSON Schema de %s diz ao modelo que o exemplo não tem alternativa correta nem citação",
    (subject) => {
      const schemaText = JSON.stringify(z.toJSONSchema(kitContentSchemaBySubject[subject]));
      const jsonSchema = JSON.parse(schemaText);
      const answerProperties =
        jsonSchema.properties.workedExampleList.items.properties.answer.properties;
      expect(answerProperties.correctOptionLabel).toEqual({ type: "null" });
      expect(answerProperties.evidenceQuote).toEqual({ type: "null" });
    },
  );
});

describe("studyKitSchema (spec pedagógica §7.2)", () => {
  it("kits compostos das duas disciplinas são válidos e numerados de 1 a 10 por bloco", () => {
    for (const studyKit of [math.studyKit, portuguese.studyKit]) {
      expect(studyKitSchema.safeParse(studyKit).success).toBe(true);
      expect(studyKit.practiceQuestionList.map((question) => question.number)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
      ]);
      expect(studyKit.mockQuestionList.map((question) => question.number)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
      ]);
      expect(studyKit.formatVersion).toBe("kit-v1");
      expect(studyKit.taxonomyVersion).toBe("tax-v2");
    }
  });

  it("recusa bloqueador na qualityCheckList, alternativas fora do tipo e citação fora do texto-base", () => {
    const withMathQuestion = (change: (question: JsonRecord) => void) => {
      const kit = cloneJson(math.studyKit) as unknown as JsonRecord;
      change(firstQuestion(kit));
      return kit;
    };
    const withPortugueseQuestion = (change: (question: JsonRecord) => void) => {
      const kit = cloneJson(portuguese.studyKit) as unknown as JsonRecord;
      change(firstQuestion(kit));
      return kit;
    };
    const invalidList: unknown[] = [
      { ...math.studyKit, qualityCheckList: [createValidationIssue("figure_reference")] },
      withMathQuestion((question) => {
        question.questionType = "open_answer";
      }),
      withPortugueseQuestion((question) => {
        at(question, "answer").evidenceQuote = null;
      }),
      withPortugueseQuestion((question) => {
        question.baseTextId = "t1";
      }),
      { ...portuguese.studyKit, baseTextList: portuguese.studyKit.baseTextList.slice(0, 2) },
    ];
    for (const kit of invalidList) {
      expect(studyKitSchema.safeParse(kit).success).toBe(false);
    }
    expect(
      studyKitSchema.safeParse({
        ...math.studyKit,
        qualityCheckList: [createValidationIssue("unit_missing", { itemId: "p1" })],
      }).success,
    ).toBe(true);
  });

  it("z.toJSONSchema gera o schema de cada etapa sem erro", () => {
    const schemaList = [
      photoExtractionSchema,
      kitPlanSchema,
      kitContentSchemaBySubject.math,
      kitContentSchemaBySubject.portuguese,
      kitRepairSchemaBySubject.math,
      kitRepairSchemaBySubject.portuguese,
      reviewResultSchema,
    ];
    for (const schema of schemaList) {
      const jsonSchema = z.toJSONSchema(schema);
      expect(jsonSchema.type).toBe("object");
      expect(jsonSchema.additionalProperties).toBe(false);
    }
  });
});

describe("composeStudyKit (spec pedagógica §7.3)", () => {
  it("rotula assuntos pela taxonomia e pelo outro e copia metadados da vaga e do plano", () => {
    expect(math.studyKit.topicList).toEqual([
      { topicRef: "ma5-fractions", label: "Frações: parte do todo e divisão" },
      { topicRef: "ma5-perimeter-area", label: "Perímetro e área" },
      { topicRef: "other", label: OTHER_TOPIC_LABEL },
    ]);
    const [firstMock] = math.studyKit.mockQuestionList;
    expect(firstMock).toMatchObject({
      questionId: "m1",
      block: "mock",
      number: 1,
      topicRef: math.kitSlotPlan.mockSlotList[0]?.topicRef,
      difficulty: "easy",
      questionType: math.plan.slotDetailList[10]?.questionType,
      isContextualized: true,
      baseTextId: null,
    });
    expect(math.studyKit.workedExampleList.map((example) => example.topicRef)).toEqual([
      "ma5-fractions",
      "ma5-perimeter-area",
    ]);
    expect(portuguese.studyKit.baseTextList.map((text) => [text.baseTextId, text.block])).toEqual([
      ["t1", "mock"],
      ["t2", "mock"],
      ["t3", "practice"],
    ]);
    expect(math.studyKit.qualityCheckList).toEqual([]);
  });

  it("dado do pedido inválido é erro de quem chama, não kit_slot_mismatch", () => {
    const composeWith = (override: Record<string, unknown>) => () =>
      composeStudyKit({
        content: math.content,
        kitSlotPlan: math.kitSlotPlan,
        plan: math.plan,
        grade: "5",
        subject: "math",
        perceivedDifficulty: null,
        materialProfile: FIXTURE_MATERIAL_PROFILE,
        sourceWarningCodeList: [],
        generationVersion: GENERATION_VERSION,
        ...override,
      });
    expect(composeWith({ generationVersion: "generate-v1" })).toThrow(InvalidComposeInputError);
    expect(composeWith({ sourceWarningCodeList: ["grade_mismatch", "grade_mismatch"] })).toThrow(
      InvalidComposeInputError,
    );
    expect(composeWith({})).not.toThrow();
  });

  it("saída fora do schema é kit_output_invalid", () => {
    expect(codesOf(compose("math", { ...math.content, extra: 1 }))).toEqual(["kit_output_invalid"]);
    expect(codesOf(compose("math", portuguese.content))).toEqual(["kit_output_invalid"]);
  });

  it.each<[string, Subject, (content: JsonRecord) => void]>([
    [
      "questões fora de ordem",
      "math",
      (content) => {
        const list = listAt(content, "practiceQuestionList");
        const [first, second] = list;
        if (first && second) [list[0], list[1]] = [second, first];
      },
    ],
    [
      "exemplos fora de ordem",
      "math",
      (content) => {
        listAt(content, "workedExampleList").reverse();
      },
    ],
    [
      "seções de revisão fora da ordem dos assuntos",
      "math",
      (content) => {
        listAt(content, "reviewSectionList").reverse();
      },
    ],
    [
      "seção de revisão de outro assunto",
      "math",
      (content) => {
        const section = listAt(content, "reviewSectionList")[0];
        if (section) section.topicRef = "ma5-volume";
      },
    ],
    [
      "textos-base diferentes dos planejados",
      "portuguese",
      (content) => {
        listAt(content, "baseTextList").pop();
      },
    ],
    [
      "alternativas em vaga aberta",
      "math",
      (content) => {
        const openQuestion = listAt(content, "practiceQuestionList")[1];
        const multipleChoice = firstQuestion(content);
        if (openQuestion) {
          openQuestion.optionList = multipleChoice.optionList;
          at(openQuestion, "answer").correctOptionLabel = "A";
        }
      },
    ],
    [
      "vaga de múltipla escolha sem alternativas",
      "math",
      (content) => {
        const question = firstQuestion(content);
        question.optionList = null;
        at(question, "answer").correctOptionLabel = null;
      },
    ],
    [
      "questão com texto-base sem citação",
      "portuguese",
      (content) => {
        at(firstQuestion(content), "answer").evidenceQuote = null;
      },
    ],
    [
      "citação sem texto-base",
      "portuguese",
      (content) => {
        const question = listAt(content, "practiceQuestionList")[5];
        if (question) at(question, "answer").evidenceQuote = "um trecho do nada";
      },
    ],
  ])("kit_slot_mismatch: %s", (_, subject, edit) => {
    expect(codesOf(compose(subject, editContent(subject, edit)))).toContain("kit_slot_mismatch");
    expect(new Set(codesOf(compose(subject, editContent(subject, edit))))).toEqual(
      new Set(["kit_slot_mismatch"]),
    );
  });
});

describe("applyKitRepair (spec pedagógica §7.2, §10)", () => {
  const emptyRepair = {
    reviewSectionList: [],
    workedExampleList: [],
    baseTextList: [],
    practiceQuestionList: [],
    mockQuestionList: [],
  };

  it("troca só o item pedido e mantém os demais idênticos", () => {
    const original = math.content.practiceQuestionList[0];
    if (original === undefined) throw new Error("fixture");
    const repaired = { ...original, statement: `${original.statement} Explique a conta.` };
    const result = applyKitRepair(
      math.studyKit,
      { ...emptyRepair, practiceQuestionList: [repaired] },
      ["p1"],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.practiceQuestionList[0]).toMatchObject({
      statement: repaired.statement,
      block: "practice",
      number: 1,
      topicRef: math.studyKit.practiceQuestionList[0]?.topicRef,
    });
    expect(result.value.practiceQuestionList.slice(1)).toEqual(
      math.studyKit.practiceQuestionList.slice(1),
    );
    expect(result.value.mockQuestionList).toEqual(math.studyKit.mockQuestionList);
  });

  it("troca seção de revisão e texto-base pelo id", () => {
    const section = portuguese.content.reviewSectionList[1];
    const baseText = portuguese.content.baseTextList[2];
    if (section === undefined || baseText === undefined) throw new Error("fixture");
    const result = applyKitRepair(
      portuguese.studyKit,
      {
        ...emptyRepair,
        reviewSectionList: [{ ...section, title: "Revisão nova" }],
        baseTextList: [{ ...baseText, title: "Título novo" }],
      },
      ["lp5-word-meaning", "t3"],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.reviewSectionList[1]?.title).toBe("Revisão nova");
    expect(result.value.baseTextList[2]).toMatchObject({ title: "Título novo", block: "practice" });
  });

  it("falha com id a mais, id a menos, saída fora do schema e item que quebra a vaga", () => {
    const [first, second] = math.content.practiceQuestionList;
    const portugueseFirst = portuguese.content.practiceQuestionList[0];
    if (first === undefined || second === undefined || portugueseFirst === undefined) {
      throw new Error("fixture");
    }
    const codeOf = (result: ReturnType<typeof applyKitRepair>) =>
      result.ok ? [] : result.error.map((issue) => issue.code);
    expect(
      codeOf(
        applyKitRepair(math.studyKit, { ...emptyRepair, practiceQuestionList: [first, second] }, [
          "p1",
        ]),
      ),
    ).toEqual(["kit_slot_mismatch"]);
    expect(
      codeOf(
        applyKitRepair(math.studyKit, { ...emptyRepair, practiceQuestionList: [first] }, [
          "p1",
          "p2",
        ]),
      ),
    ).toEqual(["kit_slot_mismatch"]);
    expect(codeOf(applyKitRepair(math.studyKit, { ...emptyRepair, extra: 1 }, []))).toEqual([
      "kit_output_invalid",
    ]);
    expect(
      codeOf(
        applyKitRepair(
          math.studyKit,
          {
            ...emptyRepair,
            practiceQuestionList: [
              { ...first, optionList: null, answer: { ...first.answer, correctOptionLabel: null } },
            ],
          },
          ["p1"],
        ),
      ),
    ).toEqual(["kit_slot_mismatch"]);
    expect(
      codeOf(
        applyKitRepair(
          portuguese.studyKit,
          {
            ...emptyRepair,
            practiceQuestionList: [
              { ...portugueseFirst, answer: { ...portugueseFirst.answer, evidenceQuote: null } },
            ],
          },
          ["p1"],
        ),
      ),
    ).toEqual(["kit_slot_mismatch"]);
  });
});

describe("listAnswerKey e formatExpectedAnswer (spec pedagógica §7.2)", () => {
  it("gabarito tem as 20 respostas na ordem dos blocos, com a alternativa correta", () => {
    const answerKey = listAnswerKey(math.studyKit);
    expect(answerKey).toHaveLength(ANSWER_KEY_COUNT);
    expect(answerKey.map((entry) => entry.questionId)).toEqual([
      ...math.studyKit.practiceQuestionList.map((question) => question.questionId),
      ...math.studyKit.mockQuestionList.map((question) => question.questionId),
    ]);
    const [first, second] = answerKey;
    expect(first?.correctOption?.label).toBe(first?.answer.correctOptionLabel ?? undefined);
    expect(second?.correctOption).toBeNull();
  });

  const format = (answer: ExpectedAnswer) =>
    formatExpectedAnswer(answer, { formatExpression: (expression) => `latex(${expression})` });
  const number = (value: number, unit: string | null = null): ExpectedAnswer => ({
    kind: "number",
    value,
    unit,
    tolerance: 0,
  });

  it.each<[ExpectedAnswer, string]>([
    [number(2.5), "2,5"],
    [number(1250), "1.250"],
    [number(-1250.5), "-1.250,5"],
    [number(1234567.25), "1.234.567,25"],
    [number(0.1 + 0.2), "0,30000000000000004"],
    [number(12.5, "R$"), "R$ 12,50"],
    [number(7, "R$"), "R$ 7,00"],
    [number(12.555, "R$"), "R$ 12,56"],
    [number(10 / 3, "R$"), "R$ 3,33"],
    [number(-0.001, "R$"), "R$ 0,00"],
    [number(30, "cm"), "30 cm"],
    [number(25, "°C"), "25 °C"],
    [number(25, "%"), "25%"],
    [number(12.5, "%"), "12,5%"],
    [number(30, "°"), "30°"],
    [{ kind: "fraction", numerator: -3, denominator: 4, unit: "kg" }, "\\(-\\frac{3}{4}\\) kg"],
    [{ kind: "fraction", numerator: 1, denominator: 2, unit: null }, "\\(\\frac{1}{2}\\)"],
    [{ kind: "set", valueList: ["1", "2,5", "4"] }, "1; 2,5; 4"],
    [{ kind: "expression", expression: "2 * x + 1" }, "\\(latex(2 * x + 1)\\)"],
    [{ kind: "text", value: "substantivo", acceptedList: [] }, "substantivo"],
  ])("formata %j como %s", (answer, expected) => {
    expect(format(answer)).toBe(expected);
  });
});

describe("listKitTextEntry", () => {
  it("dá itemId nulo só ao rótulo dos assuntos e à dica, e topicRef à revisão", () => {
    const entryList = listKitTextEntry(math.studyKit);
    const nullItemFieldSet = new Set(
      entryList.filter((entry) => entry.itemId === null).map((entry) => entry.field),
    );
    expect(nullItemFieldSet).toEqual(new Set(["topic_label", "study_tip"]));
    expect(entryList.find((entry) => entry.field === "review_title")?.itemId).toBe("ma5-fractions");
    expect(
      entryList.some((entry) => entry.field === "topic_label" && entry.text === OTHER_TOPIC_LABEL),
    ).toBe(true);
  });

  it("inclui texto-base, alternativas de Português e citação", () => {
    const fieldSet = new Set(listKitTextEntry(portuguese.studyKit).map((entry) => entry.field));
    for (const field of [
      "base_text_paragraph",
      "option",
      "evidence_quote",
      "answer_text",
    ] as const) {
      expect(fieldSet.has(field)).toBe(true);
    }
  });
});

import { describe, expect, it } from "bun:test";
import {
  MAX_BASE_TEXT_COUNT,
  MOCK_QUESTION_COUNT,
  MULTIPLE_CHOICE_OPTION_COUNT,
  PRACTICE_QUESTION_COUNT,
  WORKED_EXAMPLE_COUNT,
} from "#src/constants.ts";
import {
  baseTextIdList,
  generationVersionSchema,
  kitItemIdSchema,
  kitTableSchema,
  kitTextSchema,
  mockQuestionIdList,
  optionLabelList,
  practiceQuestionIdList,
  reviewedItemIdList,
  topicRefSchema,
  workedExampleIdList,
} from "#src/pedagogy/kit-item.ts";

describe("tipos comuns do kit (spec pedagógica §2)", () => {
  it("topicRef aceita id da taxonomia e other, recusa não atendido e texto solto", () => {
    expect(topicRefSchema.safeParse("other").success).toBe(true);
    expect(topicRefSchema.safeParse("ma5-equivalent-fractions").success).toBe(true);
    expect(topicRefSchema.safeParse("ma-grid-symmetry").success).toBe(false);
    expect(topicRefSchema.safeParse("outro").success).toBe(false);
    expect(topicRefSchema.safeParse("").success).toBe(false);
  });

  it("listas de id têm o tamanho das constantes", () => {
    expect(practiceQuestionIdList).toHaveLength(PRACTICE_QUESTION_COUNT);
    expect(mockQuestionIdList).toHaveLength(MOCK_QUESTION_COUNT);
    expect(workedExampleIdList).toHaveLength(WORKED_EXAMPLE_COUNT);
    expect(baseTextIdList).toHaveLength(MAX_BASE_TEXT_COUNT);
    expect(optionLabelList).toHaveLength(MULTIPLE_CHOICE_OPTION_COUNT);
    expect(reviewedItemIdList).toHaveLength(
      PRACTICE_QUESTION_COUNT + MOCK_QUESTION_COUNT + WORKED_EXAMPLE_COUNT,
    );
    expect(practiceQuestionIdList.every((id, index) => id === `p${index + 1}`)).toBe(true);
    expect(mockQuestionIdList.every((id, index) => id === `m${index + 1}`)).toBe(true);
  });

  it("itemId fora da faixa falha", () => {
    for (const id of ["p0", "p11", "m11", "e3", "t4", "q1"]) {
      expect(kitItemIdSchema.safeParse(id).success).toBe(false);
    }
    for (const id of ["p1", "p10", "m10", "e2", "t3"]) {
      expect(kitItemIdSchema.safeParse(id).success).toBe(true);
    }
  });

  it("kitText só apara e limita tamanho", () => {
    const schema = kitTextSchema(3, 5);
    expect(schema.parse("  abc  ")).toBe("abc");
    expect(schema.safeParse("ab").success).toBe(false);
    expect(schema.safeParse("abcdef").success).toBe(false);
  });

  it("kitTable exige o mesmo número de células por linha e célula de 1 a 40", () => {
    const table = { headerList: ["Fruta", "Preço"], rowList: [["Maçã", "R$ 2,00"]] };
    expect(kitTableSchema.safeParse(table).success).toBe(true);
    expect(kitTableSchema.safeParse({ ...table, rowList: [["Maçã"]] }).success).toBe(false);
    expect(kitTableSchema.safeParse({ ...table, rowList: [["Maçã", " "]] }).success).toBe(false);
    expect(
      kitTableSchema.safeParse({ ...table, rowList: [["Maçã", "x".repeat(41)]] }).success,
    ).toBe(false);
    expect(kitTableSchema.safeParse({ headerList: ["Só"], rowList: [["um"]] }).success).toBe(false);
  });

  it("generationVersion junta as quatro versões", () => {
    expect(
      generationVersionSchema.safeParse("extract-v1+plan-v1+generate-v1+review-v1").success,
    ).toBe(true);
    expect(generationVersionSchema.safeParse("generate-v1").success).toBe(false);
  });
});

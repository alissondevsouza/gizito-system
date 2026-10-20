import { describe, expect, it } from "bun:test";
import { expectedAnswerSchema } from "#src/pedagogy/expected-answer.ts";

describe("expectedAnswerSchema (PRD §7.3)", () => {
  it("aceita os cinco tipos", () => {
    const validList = [
      { kind: "number", value: 12.5, unit: "cm", tolerance: 0.01 },
      { kind: "number", value: 7, unit: null, tolerance: 0 },
      { kind: "fraction", numerator: -3, denominator: 4, unit: null },
      { kind: "expression", expression: "2x + 1" },
      { kind: "set", valueList: ["1", "2", "3", "4", "6", "12"] },
      { kind: "text", value: "substantivo", acceptedList: ["nome", "substantivo comum"] },
    ];
    for (const answer of validList) {
      expect(expectedAnswerSchema.safeParse(answer).success).toBe(true);
    }
  });

  it("rejeita número infinito, denominador zero ou negativo, conjunto vazio e tipo desconhecido", () => {
    const invalidList = [
      { kind: "number", value: Number.POSITIVE_INFINITY, unit: null, tolerance: 0 },
      { kind: "number", value: 1, unit: null, tolerance: -1 },
      { kind: "fraction", numerator: 1, denominator: 0, unit: null },
      { kind: "fraction", numerator: 1, denominator: -2, unit: null },
      { kind: "fraction", numerator: 1.5, denominator: 2, unit: null },
      { kind: "set", valueList: [] },
      { kind: "text", value: "   ", acceptedList: [] },
      { kind: "boolean", value: true },
    ];
    for (const answer of invalidList) {
      expect(expectedAnswerSchema.safeParse(answer).success).toBe(false);
    }
  });
});

it("expectedAnswerSchema recusa chave a mais, porque entra em saída de modelo", () => {
  expect(
    expectedAnswerSchema.safeParse({
      kind: "number",
      value: 1,
      unit: null,
      tolerance: 0,
      note: "x",
    }).success,
  ).toBe(false);
});

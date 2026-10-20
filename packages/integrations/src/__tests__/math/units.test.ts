import { describe, expect, it } from "bun:test";
import { unit as createUnit } from "mathjs";
import {
  convertUnitValue,
  expressionUnitSymbolSet,
  findResultUnitEntry,
  findUnitEntry,
  isSameDimension,
  normalizeUnitText,
  unitEntryList,
} from "#src/math/units.ts";

function entryOf(unit: string) {
  const entry = findUnitEntry(unit);
  if (entry === null) throw new Error(`unidade fora da tabela: ${unit}`);
  return entry;
}

describe("tabela de unidades (spec F1-04, RF-03)", () => {
  it("cada apelido aponta para uma única unidade, já normalizado", () => {
    const aliasList = unitEntryList.flatMap((entry) => entry.aliasList);
    expect(new Set(aliasList).size).toBe(aliasList.length);
    for (const alias of aliasList) expect(normalizeUnitText(alias)).toBe(alias);
  });

  it("cada unidade da tabela é uma unidade do mathjs e o símbolo de exibição é apelido dela", () => {
    for (const entry of unitEntryList) {
      expect(() => createUnit(entry.mathjsUnit)).not.toThrow();
      expect(findUnitEntry(entry.displayUnit)).toBe(entry);
      for (const symbol of entry.expressionSymbolList) {
        expect(createUnit(symbol).equalBase(createUnit(entry.mathjsUnit))).toBe(true);
      }
    }
  });

  it.each([
    ["metros", "m"],
    ["M", "m"],
    [" Metro ", "m"],
    ["cm^2", "cm²"],
    ["centímetros quadrados", "cm²"],
    ["Horas", "h"],
    ["mL", "mL"],
    ["litros", "L"],
    ["km / h", "km/h"],
    ["°C", "°C"],
    ["graus", "°"],
    ["dias", "dia"],
  ])("%j é %j", (written, displayUnit) => {
    expect(findUnitEntry(written)?.displayUnit).toBe(displayUnit);
  });

  it.each(["R$", "%", "mês", "meses", "ano", "anos", "pessoas", "reais"])(
    "%j fica fora da tabela (unidade opaca)",
    (written) => {
      expect(findUnitEntry(written)).toBeNull();
    },
  );

  it("mês e ano não são aceitos na expressão; min é", () => {
    expect(expressionUnitSymbolSet.has("month")).toBe(false);
    expect(expressionUnitSymbolSet.has("year")).toBe(false);
    expect(expressionUnitSymbolSet.has("min")).toBe(true);
  });

  it("compara grandeza e converte valor", () => {
    expect(isSameDimension(entryOf("cm"), entryOf("km"))).toBe(true);
    expect(isSameDimension(entryOf("cm"), entryOf("kg"))).toBe(false);
    expect(convertUnitValue(2.5, entryOf("m"), entryOf("cm"))).toBeCloseTo(250, 9);
    expect(convertUnitValue(30, entryOf("°C"), entryOf("°C"))).toBe(30);
  });

  it("unidade do resultado: simples como está, composta simplificada, fora da tabela na de referência", () => {
    expect(findResultUnitEntry(createUnit(250, "cm"))?.displayUnit).toBe("cm");
    expect(findResultUnitEntry(createUnit(3, "hours"))?.displayUnit).toBe("h");
    expect(findResultUnitEntry(createUnit(3, "m").multiply(createUnit(4, "m")))?.displayUnit).toBe(
      "m²",
    );
    expect(findResultUnitEntry(createUnit(2, "inch"))?.displayUnit).toBe("m");
    expect(findResultUnitEntry(createUnit(2, "A"))).toBeNull();
  });
});

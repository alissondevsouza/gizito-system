import { normalizeSpacing } from "@gizito/core";
import { unit as createUnit, type Unit } from "mathjs";

export type UnitEntry = {
  readonly mathjsUnit: string;
  readonly displayUnit: string;
  readonly expressionSymbolList: readonly string[];
  readonly aliasList: readonly string[];
};

export const unitEntryList: readonly UnitEntry[] = [
  {
    mathjsUnit: "mm",
    displayUnit: "mm",
    expressionSymbolList: ["mm"],
    aliasList: ["mm", "milímetro", "milímetros"],
  },
  {
    mathjsUnit: "cm",
    displayUnit: "cm",
    expressionSymbolList: ["cm"],
    aliasList: ["cm", "centímetro", "centímetros"],
  },
  {
    mathjsUnit: "dm",
    displayUnit: "dm",
    expressionSymbolList: ["dm"],
    aliasList: ["dm", "decímetro", "decímetros"],
  },
  {
    mathjsUnit: "m",
    displayUnit: "m",
    expressionSymbolList: ["m"],
    aliasList: ["m", "metro", "metros"],
  },
  {
    mathjsUnit: "dam",
    displayUnit: "dam",
    expressionSymbolList: ["dam"],
    aliasList: ["dam", "decâmetro", "decâmetros"],
  },
  {
    mathjsUnit: "hm",
    displayUnit: "hm",
    expressionSymbolList: ["hm"],
    aliasList: ["hm", "hectômetro", "hectômetros"],
  },
  {
    mathjsUnit: "km",
    displayUnit: "km",
    expressionSymbolList: ["km"],
    aliasList: ["km", "quilômetro", "quilômetros"],
  },
  {
    mathjsUnit: "mm^2",
    displayUnit: "mm²",
    expressionSymbolList: [],
    aliasList: ["mm²", "milímetro quadrado", "milímetros quadrados"],
  },
  {
    mathjsUnit: "cm^2",
    displayUnit: "cm²",
    expressionSymbolList: [],
    aliasList: ["cm²", "centímetro quadrado", "centímetros quadrados"],
  },
  {
    mathjsUnit: "dm^2",
    displayUnit: "dm²",
    expressionSymbolList: [],
    aliasList: ["dm²", "decímetro quadrado", "decímetros quadrados"],
  },
  {
    mathjsUnit: "m^2",
    displayUnit: "m²",
    expressionSymbolList: [],
    aliasList: ["m²", "metro quadrado", "metros quadrados"],
  },
  {
    mathjsUnit: "km^2",
    displayUnit: "km²",
    expressionSymbolList: [],
    aliasList: ["km²", "quilômetro quadrado", "quilômetros quadrados"],
  },
  {
    mathjsUnit: "hectare",
    displayUnit: "ha",
    expressionSymbolList: ["hectare"],
    aliasList: ["ha", "hectare", "hectares"],
  },
  {
    mathjsUnit: "cm^3",
    displayUnit: "cm³",
    expressionSymbolList: [],
    aliasList: ["cm³", "centímetro cúbico", "centímetros cúbicos"],
  },
  {
    mathjsUnit: "dm^3",
    displayUnit: "dm³",
    expressionSymbolList: [],
    aliasList: ["dm³", "decímetro cúbico", "decímetros cúbicos"],
  },
  {
    mathjsUnit: "m^3",
    displayUnit: "m³",
    expressionSymbolList: [],
    aliasList: ["m³", "metro cúbico", "metros cúbicos"],
  },
  {
    mathjsUnit: "mL",
    displayUnit: "mL",
    expressionSymbolList: ["mL", "ml"],
    aliasList: ["ml", "mililitro", "mililitros"],
  },
  {
    mathjsUnit: "cL",
    displayUnit: "cL",
    expressionSymbolList: ["cL", "cl"],
    aliasList: ["cl", "centilitro", "centilitros"],
  },
  {
    mathjsUnit: "dL",
    displayUnit: "dL",
    expressionSymbolList: ["dL", "dl"],
    aliasList: ["dl", "decilitro", "decilitros"],
  },
  {
    mathjsUnit: "L",
    displayUnit: "L",
    expressionSymbolList: ["L", "l"],
    aliasList: ["l", "litro", "litros"],
  },
  {
    mathjsUnit: "mg",
    displayUnit: "mg",
    expressionSymbolList: ["mg"],
    aliasList: ["mg", "miligrama", "miligramas"],
  },
  {
    mathjsUnit: "cg",
    displayUnit: "cg",
    expressionSymbolList: ["cg"],
    aliasList: ["cg", "centigrama", "centigramas"],
  },
  {
    mathjsUnit: "dg",
    displayUnit: "dg",
    expressionSymbolList: ["dg"],
    aliasList: ["dg", "decigrama", "decigramas"],
  },
  {
    mathjsUnit: "g",
    displayUnit: "g",
    expressionSymbolList: ["g"],
    aliasList: ["g", "grama", "gramas"],
  },
  {
    mathjsUnit: "dag",
    displayUnit: "dag",
    expressionSymbolList: ["dag"],
    aliasList: ["dag", "decagrama", "decagramas"],
  },
  {
    mathjsUnit: "hg",
    displayUnit: "hg",
    expressionSymbolList: ["hg"],
    aliasList: ["hg", "hectograma", "hectogramas"],
  },
  {
    mathjsUnit: "kg",
    displayUnit: "kg",
    expressionSymbolList: ["kg"],
    aliasList: ["kg", "quilograma", "quilogramas", "quilo", "quilos"],
  },
  {
    mathjsUnit: "t",
    displayUnit: "t",
    expressionSymbolList: ["t", "tonne"],
    aliasList: ["t", "tonelada", "toneladas"],
  },
  {
    mathjsUnit: "s",
    displayUnit: "s",
    expressionSymbolList: ["s", "second", "seconds"],
    aliasList: ["s", "seg", "segundo", "segundos"],
  },
  {
    mathjsUnit: "min",
    displayUnit: "min",
    expressionSymbolList: ["min", "minute", "minutes"],
    aliasList: ["min", "minuto", "minutos"],
  },
  {
    mathjsUnit: "h",
    displayUnit: "h",
    expressionSymbolList: ["h", "hour", "hours"],
    aliasList: ["h", "hora", "horas"],
  },
  {
    mathjsUnit: "day",
    displayUnit: "dia",
    expressionSymbolList: ["day", "days"],
    aliasList: ["dia", "dias"],
  },
  {
    mathjsUnit: "week",
    displayUnit: "semana",
    expressionSymbolList: ["week", "weeks"],
    aliasList: ["semana", "semanas"],
  },
  {
    mathjsUnit: "deg",
    displayUnit: "°",
    expressionSymbolList: ["deg", "degree", "degrees"],
    aliasList: ["°", "grau", "graus"],
  },
  {
    mathjsUnit: "degC",
    displayUnit: "°C",
    expressionSymbolList: ["degC", "celsius"],
    aliasList: ["°c", "grau celsius", "graus celsius"],
  },
  {
    mathjsUnit: "km / h",
    displayUnit: "km/h",
    expressionSymbolList: [],
    aliasList: ["km/h", "quilômetro por hora", "quilômetros por hora"],
  },
  {
    mathjsUnit: "m / s",
    displayUnit: "m/s",
    expressionSymbolList: [],
    aliasList: ["m/s", "metro por segundo", "metros por segundo"],
  },
];

const referenceMathjsUnitList: readonly string[] = [
  "m",
  "m^2",
  "m^3",
  "kg",
  "s",
  "deg",
  "degC",
  "m / s",
];

export const expressionUnitSymbolSet: ReadonlySet<string> = new Set(
  unitEntryList.flatMap((entry) => entry.expressionSymbolList),
);

export const mathExpressionUnitSymbolList: readonly string[] = unitEntryList.flatMap((entry) =>
  entry.expressionSymbolList.slice(0, 1),
);

export function normalizeUnitText(unit: string): string {
  return normalizeSpacing(unit)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/º/g, "°")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\^2/g, "²")
    .replace(/\^3/g, "³");
}

const unitEntryByAlias = new Map(
  unitEntryList.flatMap((entry) =>
    entry.aliasList.map((alias) => [normalizeUnitText(alias), entry] as const),
  ),
);

export function findUnitEntry(unit: string): UnitEntry | null {
  return unitEntryByAlias.get(normalizeUnitText(unit)) ?? null;
}

export function isSameDimension(left: UnitEntry, right: UnitEntry): boolean {
  return createUnit(left.mathjsUnit).equalBase(createUnit(right.mathjsUnit));
}

export function convertUnitValue(value: number, from: UnitEntry, to: UnitEntry): number {
  return from === to ? value : createUnit(value, from.mathjsUnit).toNumber(to.mathjsUnit);
}

function groupUnitFactorText(factorText: string): string {
  const powerByName = new Map<string, number>();
  for (const factor of factorText.replace(/[()]/g, "").split(" ").filter(Boolean)) {
    const [name = "", power = "1"] = factor.split("^");
    powerByName.set(name, (powerByName.get(name) ?? 0) + Number(power));
  }
  return [...powerByName]
    .map(([name, power]) => (power === 1 ? name : `${name}^${power}`))
    .join(" ");
}

function formattedUnitOf(unit: Unit): string {
  return unit.formatUnits().split(" / ").map(groupUnitFactorText).join(" / ");
}

export function findResultUnitEntry(unit: Unit): UnitEntry | null {
  const formattedUnit = formattedUnitOf(unit);
  const exactEntry = unitEntryList.find(
    (entry) =>
      entry.mathjsUnit === formattedUnit || entry.expressionSymbolList.includes(formattedUnit),
  );
  if (exactEntry !== undefined) return exactEntry;
  const referenceUnit = referenceMathjsUnitList.find((mathjsUnit) =>
    unit.equalBase(createUnit(mathjsUnit)),
  );
  return unitEntryList.find((entry) => entry.mathjsUnit === referenceUnit) ?? null;
}

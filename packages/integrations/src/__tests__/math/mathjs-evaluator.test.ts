import { describe, expect, it } from "bun:test";
import type { ExpectedAnswer, MathEvaluationErrorCode, MathEvaluator } from "@gizito/core";
import { parseMathExpression } from "#src/math/expression.ts";
import { createMathjsEvaluator } from "#src/math/mathjs-evaluator.ts";

const evaluator: MathEvaluator = createMathjsEvaluator();

function number(value: number, unit: string | null = null, tolerance = 0): ExpectedAnswer {
  return { kind: "number", value, unit, tolerance };
}

function fraction(numerator: number, denominator: number, unit: string | null = null) {
  return { kind: "fraction", numerator, denominator, unit } satisfies ExpectedAnswer;
}

function expression(text: string): ExpectedAnswer {
  return { kind: "expression", expression: text };
}

function set(...valueList: string[]): ExpectedAnswer {
  return { kind: "set", valueList };
}

function text(value: string, ...acceptedList: string[]): ExpectedAnswer {
  return { kind: "text", value, acceptedList };
}

function evaluateCode(source: string): MathEvaluationErrorCode | null {
  const result = evaluator.evaluate(source);
  return result.ok ? null : result.error.code;
}

describe("expressão aceita (spec F1-04, RF-01)", () => {
  it.each([
    "x = 4",
    "f(x) = x",
    '"abc"',
    "[1, 2]",
    "1:3",
    "3 > 2",
    "x > 2 ? 1 : 0",
    "min(3, 4)",
    'evaluate("1+1")',
    "import",
    "reais",
    "5!",
    "2'",
    "2 m + x",
    "X + 1",
    "{a: 1}",
    "a.b",
  ])("%j é unsupported", (source) => {
    expect(evaluateCode(source)).toBe("unsupported");
  });

  it.each(["1,5", "2 +", "", "   ", "(1 + 2"])("%j é parse_error", (source) => {
    expect(evaluateCode(source)).toBe("parse_error");
  });

  it("classifica unidade, constante e variável", () => {
    const parsed = parseMathExpression("2 h + 30 min");
    expect(parsed.ok && parsed.value.unitSymbolList).toEqual(["h", "min"]);
    const algebra = parseMathExpression("2*pi*r + y + e");
    expect(algebra.ok && algebra.value.variableList).toEqual(["e", "r", "y"]);
  });

  it.each<[string, readonly string[], readonly string[]]>([
    ["2 m + 30 cm", ["m", "cm"], []],
    ["2 m", ["m"], []],
    ["3 m^2 + 1 m^2", ["m"], []],
    ["50 km/h to m/s", ["km", "h", "m", "s"], []],
    ["2 t to kg", ["t", "kg"], []],
    ["b*h", [], ["b", "h"]],
    ["h*h + h", [], ["h"]],
    ["4*l", [], ["l"]],
    ["5*m", [], ["m"]],
    ["2*t + 3", [], ["t"]],
  ])("letra de unidade em %j: unidades %j, variáveis %j", (source, unitList, variableList) => {
    const parsed = parseMathExpression(source);
    expect(parsed.ok && parsed.value.unitSymbolList).toEqual([...unitList]);
    expect(parsed.ok && parsed.value.variableList).toEqual([...variableList]);
  });

  it("devolve o erro com a expressão original", () => {
    expect(evaluator.evaluate("x = 4")).toEqual({
      ok: false,
      error: { code: "unsupported", expression: "x = 4" },
    });
  });
});

describe("evaluate (spec F1-04, RF-02)", () => {
  it.each<[string, ExpectedAnswer]>([
    ["12 * 3 + 5", number(41)],
    ["3/4 + 1/8", number(0.875)],
    ["0.1 + 0.2", number(0.3)],
    ["25% * 80", number(20)],
    ["17 mod 5", number(2)],
    ["floor(17 / 5)", number(3)],
    ["ceil(130 / 40)", number(4)],
    ["round(10 / 3, 2)", number(3.33)],
    ["gcd(12, 18)", number(6)],
    ["lcm(4, 6)", number(12)],
    ["abs(3 - 8)", number(5)],
    ["sqrt(49)", number(7)],
    ["2^3 - -1", number(9)],
    ["2 m + 30 cm", number(2.3, "m")],
    ["2.5 m to cm", number(250, "cm")],
    ["2 h + 30 min", number(2.5, "h")],
    ["90 min to h", number(1.5, "h")],
    ["3 m * 4 m", number(12, "m²")],
    ["3 cm * 4 cm * 5 cm", number(60, "cm³")],
    ["2 L + 500 mL", number(2.5, "L")],
    ["2 t to kg", number(2000, "kg")],
    ["10 km / 2 h", number(5, "km/h")],
    ["180 deg - 50 deg - 60 deg", number(70, "°")],
    ["25 degC + 5 degC", number(30, "°C")],
    ["2 week to day", number(14, "dia")],
    ["100 cm / 2 m", number(0.5)],
  ])("%j → %j", (source, expected) => {
    expect(evaluator.evaluate(source)).toEqual({ ok: true, value: expected });
  });

  it("unidade composta não depende das unidades usadas antes", () => {
    evaluator.evaluate("2 hectare to m^2");
    evaluator.evaluate("2 L + 1 L");
    expect(evaluator.evaluate("3 m * 4 m")).toEqual({ ok: true, value: number(12, "m²") });
    expect(evaluator.evaluate("3 cm * 4 cm * 5 cm")).toEqual({
      ok: true,
      value: number(60, "cm³"),
    });
    expect(evaluator.evaluate("2 cm * 3 m")).toEqual({ ok: true, value: number(0.06, "m²") });
  });

  it("expressão com variável sai normalizada, sem simplificar, e equivalente", () => {
    const result = evaluator.evaluate("2*x + 3*x");
    expect(result).toEqual({ ok: true, value: expression("2 * x + 3 * x") });
    expect(result.ok && evaluator.equals(result.value, expression("5*x"))).toBe(true);
  });

  it("soma longa com variável é rápida", () => {
    const longSum = Array.from({ length: 40 }, (_, index) => `${index}*x`).join("+");
    const startTime = performance.now();
    const result = evaluator.evaluate(longSum);
    expect(result.ok && evaluator.equals(result.value, expression("780*x"))).toBe(true);
    expect(performance.now() - startTime).toBeLessThan(500);
  });

  it.each(["1/0", "0/0", "1 m / 0", "x/0", "sqrt(-1 - x^2)"])("%j é not_finite", (source) => {
    expect(evaluateCode(source)).toBe("not_finite");
  });

  it.each(["sqrt(-1)", "1 kg + 2 m", "2 m + 3", "cm", "2 A", "mod(1)"])(
    "%j é unsupported",
    (source) => {
      expect(evaluateCode(source)).toBe("unsupported");
    },
  );
});

describe("equals (spec F1-04, RF-04)", () => {
  it.each<[string, ExpectedAnswer, ExpectedAnswer]>([
    ["fração equivalente", fraction(2, 4), fraction(1, 2)],
    ["decimal e fração", number(0.5), fraction(1, 2)],
    ["dízima com tolerância", number(0.333, null, 0.001), fraction(1, 3)],
    ["ruído de ponto flutuante", number(0.1 + 0.2), number(0.3)],
    ["unidade convertida", number(2.5, "m"), number(250, "cm")],
    ["massa convertida", number(0.75, "kg"), number(750, "g")],
    ["fração com unidade", fraction(3, 4, "kg"), number(750, "g")],
    ["tolerância convertida", number(2.5, "m", 0.01), number(251, "cm")],
    ["apelido da unidade", number(3, "horas"), number(180, "min")],
    ["lado sem unidade", number(250), number(250, "cm")],
    ["opaca igual", number(12.5, "R$"), number(12.5, "r$")],
    ["expressão numérica", expression("2^3"), number(8)],
    ["expressão com unidade", expression("2 m + 30 cm"), number(230, "cm")],
    ["expressão simplificada", expression("5*x"), expression("2*x + 3*x")],
    ["produto notável", expression("(x+1)*(x-1)"), expression("x^2 - 1")],
    ["área com letra de unidade", expression("b*h"), expression("h*b")],
    ["perímetro com letra de unidade", expression("4*l"), expression("l + l + l + l")],
    ["tempo com letra de unidade", expression("2*t + 3"), expression("3 + 2*t")],
    ["duas variáveis", expression("2*(a + b)"), expression("2*b + 2*a")],
    ["expressão inválida igual", expression("2x +"), expression("2x+")],
    ["conjunto sem ordem", set("1", "2", "3"), set("3", "2", "1")],
    ["conjunto com repetição", set("1", "2", "2"), set("2", "1")],
    ["conjunto pt-BR", set("0,5", "1.250", "3/4"), set("1/2", "1250", "0,75")],
    ["conjunto de texto", set("Par", "ímpar"), set("ímpar", "par")],
    ["texto sem maiúscula", text("Agudo"), text("agudo")],
    ["texto aceito", text("agudo", "ângulo agudo"), text("Ângulo  agudo")],
  ])("%s: iguais", (_, left, right) => {
    expect(evaluator.equals(left, right)).toBe(true);
    expect(evaluator.equals(right, left)).toBe(true);
  });

  it.each<[string, ExpectedAnswer, ExpectedAnswer]>([
    ["dízima sem tolerância", number(0.333), fraction(1, 3)],
    ["unidade errada", number(250, "cm"), number(250, "m")],
    ["grandezas diferentes", number(5, "m"), number(5, "kg")],
    ["opacas diferentes", number(30, "R$"), number(30, "pessoas")],
    ["tabela e opaca", number(30, "m"), number(30, "metros quadrados de grama")],
    ["valor diferente", number(41), number(42)],
    ["tolerância curta", number(2.5, "m", 0.01), number(252, "cm")],
    ["expressão diferente", expression("2*x"), expression("x^2")],
    ["variável diferente", expression("2*x"), expression("2*y")],
    ["variáveis trocadas", expression("a - b"), expression("b - a")],
    ["degrau em escala maior", expression("floor(x/10)"), expression("floor(x/20)")],
    [
      "um ponto válido só",
      expression("sqrt(x - 3) + sqrt(3.2 - x)"),
      expression("(sqrt(x - 3) + sqrt(3.2 - x)) * x / 3.1"),
    ],
    ["expressão com variável e número", expression("x/x"), number(1)],
    ["expressão inválida diferente", expression("2x +"), expression("3x +")],
    ["conjunto diferente", set("1", "2"), set("1", "2", "3")],
    ["conjunto e número", set("5"), number(5)],
    ["texto e número", text("5"), number(5)],
    ["texto diferente", text("agudo"), text("obtuso")],
    ["texto com acento diferente", text("é"), text("e")],
  ])("%s: diferentes", (_, left, right) => {
    expect(evaluator.equals(left, right)).toBe(false);
    expect(evaluator.equals(right, left)).toBe(false);
  });

  it("é reflexiva e simétrica numa amostra com cada tipo", () => {
    const answerList: readonly ExpectedAnswer[] = [
      number(0.5),
      number(50, "cm"),
      number(0.5, "m", 0.01),
      number(12.5, "R$"),
      fraction(1, 2),
      fraction(1, 2, "m"),
      expression("1/2"),
      expression("x + 1"),
      expression("sqrt(-1 - x^2)"),
      expression("2x +"),
      set("1", "2"),
      text("metade"),
    ];
    for (const left of answerList) {
      expect(evaluator.equals(left, left)).toBe(true);
      for (const right of answerList) {
        expect(evaluator.equals(left, right)).toBe(evaluator.equals(right, left));
      }
    }
  });
});

describe("cenários de SP §8.2 no avaliador (spec F1-04, RF-05)", () => {
  function recalculates(calculationExpression: string, expectedAnswer: ExpectedAnswer): boolean {
    const result = evaluator.evaluate(calculationExpression);
    return result.ok && evaluator.equals(result.value, expectedAnswer);
  }

  it("expressão certa não gera código", () => {
    expect(recalculates("7 * 6", number(42))).toBe(true);
    expect(recalculates("8 * 5", number(40, "m²"))).toBe(true);
    expect(recalculates("2.5 * 100", number(250, "cm"))).toBe(true);
    expect(recalculates("2 m + 30 cm", number(230, "cm"))).toBe(true);
    expect(recalculates("3/4 - 1/4", fraction(1, 2))).toBe(true);
    expect(recalculates("15 / 60 * 100", number(25, "%"))).toBe(true);
    expect(recalculates("10 / 3", number(3.33, "R$", 0.01))).toBe(true);
    expect(recalculates("5 hm to m", number(500, "m"))).toBe(true);
    expect(recalculates("180 deg - 110 deg", number(70, "º"))).toBe(true);
    expect(recalculates("b*h/2", expression("h*b/2"))).toBe(true);
  });

  it("conta diferente é math_recalculation_mismatch", () => {
    expect(recalculates("7 * 5", number(42))).toBe(false);
    expect(recalculates("2.5 m to cm", number(250, "m"))).toBe(false);
    expect(recalculates("15 / 60", number(25, "%"))).toBe(false);
    expect(recalculates("10 / 3", number(3.33, "R$"))).toBe(false);
  });

  it("expressão inválida é err (math_expression_invalid)", () => {
    expect(evaluator.evaluate("7 × 6").ok).toBe(false);
    expect(evaluator.evaluate("7,5 * 2").ok).toBe(false);
  });

  it("alternativa 0,5 com expectedAnswer 1/2 não é correct_option_mismatch", () => {
    expect(evaluator.equals(number(0.5), fraction(1, 2))).toBe(true);
  });

  it("distrator 2/4 com correta 1/2 é distractor_equivalent", () => {
    expect(evaluator.equals(fraction(2, 4), fraction(1, 2))).toBe(true);
  });

  it("distratores 0,25 e 1/4 são option_duplicate", () => {
    expect(evaluator.equals(number(0.25), fraction(1, 4))).toBe(true);
  });

  it("distrator de unidade trocada não é equivalente à correta", () => {
    expect(evaluator.equals(number(2.5, "cm"), number(2.5, "m"))).toBe(false);
  });
});

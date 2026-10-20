import { describe, expect, it } from "bun:test";
import type { MathEvaluationErrorCode } from "@gizito/core";
import katex from "katex";
import { mathExpressionToLatex } from "#src/math/latex.ts";

describe("mathExpressionToLatex (spec F1-04, RF-06)", () => {
  const latexTable: readonly [string, string][] = [
    ["5*x + 3", "5 x+3"],
    ["5x + 3", "5 x+3"],
    ["2.5*x", "2,5 x"],
    ["1250*y", "1.250 y"],
    ["(x+1)/2", "\\frac{ x+1}{2}"],
    ["3*(x+1)", "3\\left( x+1\\right)"],
    ["(x+1)*(x-1)", "\\left( x+1\\right)\\left( x-1\\right)"],
    ["2*3", "2\\times3"],
    ["x*2", " x\\times2"],
    ["x^2", "{ x}^{2}"],
    ["2*x^2 - x*y", "2{ x}^{2}- x y"],
    ["(x+1)^2", "{\\left( x+1\\right)}^{2}"],
    ["-x/2", "\\frac{- x}{2}"],
    ["-3*x", "-3 x"],
    ["2*pi*r", "2\\pi r"],
    ["2*sqrt(x)", "2\\sqrt{ x}"],
    ["a*b", " a b"],
    ["b*h/2", "\\frac{ b h}{2}"],
    ["5 - (-3)", "5-\\left(-3\\right)"],
    ["-3 + (-5)", "-3+\\left(-5\\right)"],
    ["x - (-1)", " x-\\left(-1\\right)"],
    ["2*(-3)", "2\\times\\left(-3\\right)"],
    ["2*-3", "2\\times\\left(-3\\right)"],
    ["-(-3)", "-\\left(-3\\right)"],
    ["(-3)^2", "{\\left(-3\\right)}^{2}"],
    ["x - (y + 1)", " x-\\left( y+1\\right)"],
    ["gcd(12, 18)", "\\text{mdc}\\left(12;18\\right)"],
    ["lcm(4, 6)", "\\text{mmc}\\left(4;6\\right)"],
    ["round(2.5, 2)", "\\operatorname{round}\\left(2,5;2\\right)"],
  ];

  it.each(latexTable)("%j → %j", (expression, latex) => {
    expect(mathExpressionToLatex(expression)).toEqual({ ok: true, value: latex });
  });

  it.each<[string, MathEvaluationErrorCode]>([
    ["x = 1", "unsupported"],
    ["min(1, 2)", "unsupported"],
    ["2 +", "parse_error"],
  ])("%j é %s", (expression, code) => {
    expect(mathExpressionToLatex(expression)).toEqual({
      ok: false,
      error: { code, expression },
    });
  });

  it("a saída passa no parse do KaTeX, com a vírgula decimal trocada como o render faz", () => {
    const expressionList = [
      ...latexTable.map(([expression]) => expression),
      "5*x + 3",
      "2.5*x - 1250/3",
      "3*(x+1)^2",
      "(a + b)/(2*c)",
      "2*pi*r",
      "sqrt(x) + abs(y)",
      "x mod 3",
      "2 m + 30 cm",
    ];
    for (const expression of expressionList) {
      const result = mathExpressionToLatex(expression);
      if (!result.ok) throw new Error(`não converteu: ${expression}`);
      const katexInput = result.value.replace(/(\d),(\d)/g, "$1{,}$2");
      expect(() => katex.renderToString(katexInput, { throwOnError: true })).not.toThrow();
    }
  });
});

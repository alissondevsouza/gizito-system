import { describe, expect, it } from "bun:test";
import katex from "katex";
import { isKatexParsable, renderMathMarkup } from "#src/katex/markup.ts";

describe("isKatexParsable (spec F1-07, RF-02)", () => {
  it.each([
    "\\frac{1}{2}",
    "2,5 \\times 3",
    "\\text{cm}^{2}",
    "25\\%",
    "12 \\div 4 \\cdot 2",
    "x \\le 3 \\ge 1 \\ne 0",
    "\\text{área} = 8 \\times 5",
  ])("aceita %s", (latex) => {
    expect(isKatexParsable(latex)).toBe(true);
  });

  it.each(["\\frac{1}{", "\\fracc{1}{2}", "x^{", "\\text{aberto", "}"])("recusa %s", (latex) => {
    expect(isKatexParsable(latex)).toBe(false);
  });
});

describe("renderMathMarkup (spec F1-08, RF-01)", () => {
  it("empilha a fração no HTML do KaTeX, sem MathML", () => {
    const rendered = renderMathMarkup("\\frac{3}{4}");
    expect(rendered).toContain("mfrac");
    expect(rendered).not.toContain("<math");
  });

  it("troca a vírgula decimal entre dígitos por {,} antes do KaTeX", () => {
    expect(renderMathMarkup("2,5 \\times 3")).toBe(renderMathMarkup("2{,}5 \\times 3"));
    expect(renderMathMarkup("1.250,75")).toBe(renderMathMarkup("1.250{,}75"));
  });

  it("mantém a vírgula que separa valores", () => {
    expect(renderMathMarkup("2, 3")).not.toBe(renderMathMarkup("2{,} 3"));
  });

  it("escreve o % sem barra como porcentagem, e não como comentário que apaga o resto", () => {
    expect(renderMathMarkup("25% \\text{ de } 80")).toBe(renderMathMarkup("25\\% \\text{ de } 80"));
    expect(renderMathMarkup("25\\%")).toBe(renderMathMarkup("25%"));
  });

  it("escapa o texto dentro de \\text", () => {
    const rendered = renderMathMarkup("\\text{<b>x</b>}");
    expect(rendered).not.toContain("<b>");
    expect(rendered).toContain("&lt;");
  });

  it("não cria link com \\href", () => {
    expect(renderMathMarkup("\\href{https://exemplo.com}{x}")).not.toContain("<a ");
  });

  it("lança ParseError em trecho que o KaTeX não analisa", () => {
    expect(() => renderMathMarkup("\\frac{1}{")).toThrow(katex.ParseError);
  });
});

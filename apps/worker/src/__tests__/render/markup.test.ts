import { describe, expect, it } from "bun:test";
import { renderMathMarkup } from "@gizito/integrations";
import { escapeHtml, html, SafeHtml, trustedHtml } from "#src/render/html.ts";
import {
  expectedAnswerHtml,
  kitTextHtml,
  UnrenderableExpressionError,
} from "#src/render/kit-text.ts";

describe("html (spec F1-08, RF-01)", () => {
  it("escapa toda interpolação de texto", () => {
    expect(html`<p title="${`"x" & 'y'`}">${"<b>oi</b>"}</p>`.value).toBe(
      '<p title="&quot;x&quot; &amp; &#39;y&#39;">&lt;b&gt;oi&lt;/b&gt;</p>',
    );
  });

  it("passa o SafeHtml cru, junta listas e ignora null", () => {
    const item = html`<li>${"a<b"}</li>`;
    expect(html`<ul>${[item, item]}${null}</ul>`.value).toBe(
      "<ul><li>a&lt;b</li><li>a&lt;b</li></ul>",
    );
    expect(html`${trustedHtml("<i>x</i>")}`).toBeInstanceOf(SafeHtml);
    expect(html`${trustedHtml("<i>x</i>")}${3}`.value).toBe("<i>x</i>3");
  });

  it("escapeHtml troca os cinco caracteres", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
});

describe("kitTextHtml (spec F1-08, RF-01)", () => {
  it("escapa tag e entidade do texto do kit", () => {
    const rendered = kitTextHtml(
      '<script>alert(1)</script> <img src=x onerror=alert(1)> & "aspas"',
    ).value;
    expect(rendered).not.toContain("<script");
    expect(rendered).not.toContain("<img");
    expect(rendered).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(rendered).toContain("&amp; &quot;aspas&quot;");
  });

  it("passa só o trecho entre \\( e \\) pelo KaTeX", () => {
    const rendered = kitTextHtml("Some \\(\\frac{3}{4}\\) e <b>").value;
    expect(rendered.startsWith("Some ")).toBe(true);
    expect(rendered).toContain(renderMathMarkup("\\frac{3}{4}"));
    expect(rendered).toContain("mfrac");
    expect(rendered.endsWith(" e &lt;b&gt;")).toBe(true);
  });

  it("deixa R$ e vírgula fora da marcação como texto", () => {
    expect(kitTextHtml("Custa R$ 12,50.").value).toBe("Custa R$ 12,50.");
  });

  it("mostra o delimitador sem par como texto", () => {
    expect(kitTextHtml("a \\( b").value).toBe("a \\( b");
  });

  it("troca quebra de linha por <br>", () => {
    expect(kitTextHtml("verso 1\nverso 2").value).toBe("verso 1<br>verso 2");
  });

  it("falha quando o KaTeX não analisa o trecho", () => {
    expect(() => kitTextHtml("\\(\\frac{1}{\\)")).toThrow();
  });
});

describe("expectedAnswerHtml (spec pedagógica §7.2)", () => {
  it("escreve número, dinheiro, porcentagem e conjunto em pt-BR", () => {
    expect(
      expectedAnswerHtml({ kind: "number", value: 1250.5, unit: "cm", tolerance: 0 }).value,
    ).toBe("1.250,5 cm");
    expect(expectedAnswerHtml({ kind: "number", value: 7, unit: "R$", tolerance: 0 }).value).toBe(
      "R$ 7,00",
    );
    expect(expectedAnswerHtml({ kind: "number", value: 25, unit: "%", tolerance: 0 }).value).toBe(
      "25%",
    );
    expect(expectedAnswerHtml({ kind: "set", valueList: ["2", "4,5"] }).value).toBe("2; 4,5");
  });

  it("empilha a fração pelo KaTeX", () => {
    const rendered = expectedAnswerHtml({
      kind: "fraction",
      numerator: 3,
      denominator: 4,
      unit: null,
    }).value;
    expect(rendered).toBe(renderMathMarkup("\\frac{3}{4}"));
  });

  it("escreve a expressão em LaTeX pelo adaptador do mathjs", () => {
    const rendered = expectedAnswerHtml({ kind: "expression", expression: "2 * x + 3" }).value;
    expect(rendered).toContain("katex");
    expect(rendered).not.toContain("*");
  });

  it("falha com expressão que o adaptador não converte", () => {
    expect(() => expectedAnswerHtml({ kind: "expression", expression: "2 +* )" })).toThrow(
      UnrenderableExpressionError,
    );
  });

  it("escapa o texto da resposta", () => {
    expect(expectedAnswerHtml({ kind: "text", value: "<b>sim</b>", acceptedList: [] }).value).toBe(
      "&lt;b&gt;sim&lt;/b&gt;",
    );
  });
});

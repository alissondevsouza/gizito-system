import { describe, expect, it } from "bun:test";
import { isKatexParsable } from "#src/katex/markup.ts";

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

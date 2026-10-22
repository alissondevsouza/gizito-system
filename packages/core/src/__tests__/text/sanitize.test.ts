import { describe, expect, it } from "bun:test";
import { sanitizeUntrustedText } from "#src/text/sanitize.ts";

describe("sanitizeUntrustedText", () => {
  it("troca controle, bidi override e espaço de largura zero por espaço e junta os espaços", () => {
    expect(sanitizeUntrustedText("mais\u0000dificuldade\u0007com\tfrações")).toBe(
      "mais dificuldade com frações",
    );
    expect(sanitizeUntrustedText("fra‮ções​ de⁦ bolo")).toBe("fra ções de bolo");
    expect(sanitizeUntrustedText("  linha 1\r\n\nlinha 2  ")).toBe("linha 1 linha 2");
  });

  it("normaliza para NFC e mantém acentos e pontuação", () => {
    expect(sanitizeUntrustedText("frações: 1/2 e 3/4!")).toBe("frações: 1/2 e 3/4!");
  });

  it("texto só com controle vira vazio", () => {
    expect(sanitizeUntrustedText("\u0000​‮ \n")).toBe("");
  });
});

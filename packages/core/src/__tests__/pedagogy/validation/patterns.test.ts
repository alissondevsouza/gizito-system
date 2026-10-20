import { describe, expect, it } from "bun:test";
import {
  findBlockedTermExcerpt,
  findExternalLinkExcerpt,
  findFigureReferenceExcerpt,
  findForbiddenMarkupExcerpt,
  findMockHintExcerpt,
  findPersonalDataExcerpt,
  hasBalancedMathMarkup,
  normalizeSpacing,
} from "#src/pedagogy/validation/patterns.ts";

describe("figura (spec pedagógica §8.4, lista fechada)", () => {
  it.each([
    "observe a tabela",
    "observe o trecho",
    "observe a frase",
    "observe o verso",
    "figura de linguagem",
    "imagem poética",
    "quantos lados há na figura descrita",
    "Júlia leu 15 páginas do seu livro por dia",
    "parou na página 48",
    "Júlia parou na página 48 do livro",
    "Ana leu até a página 30 da apostila",
    "usou 12 folhas do seu caderno",
    "comprou 3 pacotes de figurinhas",
    "Lucas pendurou o desenho ao lado da janela",
    "a imagem acima da porta era antiga",
  ])("não casa: %s", (text) => {
    expect(findFigureReferenceExcerpt(text)).toBeNull();
  });

  it.each([
    ["Observe a figura abaixo", "Observe a figura"],
    ["Na figura abaixo, quantos lados há?", "Na figura abaixo"],
    ["A figura ao lado mostra um triângulo", "A figura ao lado"],
    ["Veja o gráfico", "Veja o gráfico"],
    ["Abra o livro na página 12", "Abra o livro"],
    ["Consulte seu caderno", "Consulte seu caderno"],
  ])("casa: %s", (text, excerpt) => {
    expect(findFigureReferenceExcerpt(text)).toBe(excerpt);
  });

  it("trecho devolvido é o original, com acento, mesmo com acento decomposto", () => {
    const decomposed = "Olhe a ilustração, depois responda.";
    expect(findFigureReferenceExcerpt(decomposed)).toBe("Olhe a ilustração");
  });

  it("posição seguida de complemento só deixa de casar quando o complemento vem logo depois", () => {
    expect(findFigureReferenceExcerpt("O desenho ao lado da janela e a figura abaixo")).toBe(
      "a figura abaixo",
    );
  });
});

describe("marcação proibida (spec pedagógica §8.4)", () => {
  it.each([
    "O gato ______ no telhado",
    "use <, > ou =",
    "3 < 5 e 7 > 2",
    "25 °C",
    "1.250 e 2,5",
    "R$ 12,50",
    "Complete com s ou ss: pá__aro",
    "Escreva a palavra: ca__a",
    "Se x<y, então y>x",
    "\\(2^{3} \\times 4\\)",
  ])("não casa: %s", (text) => {
    expect(findForbiddenMarkupExcerpt(text)).toBeNull();
  });

  it.each([
    ["Esta é a **resposta**", "**"],
    ["Isto é __importante__", "__"],
    ["# Título", "# "],
    ["## Seção", "## "],
    ["Veja [aqui](https://x.com)", "[aqui](https://x.com)"],
    ["use `codigo`", "`"],
    ["texto <b>forte</b>", "<b>"],
    ["linha<br/>outra", "<br/>"],
    ["Parabéns! 🎉", "🎉"],
  ])("casa: %s", (text, excerpt) => {
    expect(findForbiddenMarkupExcerpt(text)).toBe(excerpt);
  });

  it("não olha dentro da marcação matemática", () => {
    expect(findForbiddenMarkupExcerpt("Calcule \\(a**b\\) agora")).toBeNull();
  });
});

describe("dado pessoal (spec pedagógica §8.4)", () => {
  it.each([
    "(11) 98765-4321",
    "11 98765-4321",
    "11987654321",
    "(21) 3456-7890",
    "ligue 21 3456-7890 hoje",
    "ana@escola.com.br",
    "CPF 123.456.789-09",
    "12345678909",
  ])("casa: %s", (text) => {
    expect(findPersonalDataExcerpt(text)).not.toBeNull();
  });

  it.each([
    "R$ 1.250,00",
    "12.345",
    "14h30",
    "\\(\\frac{11}{98765}\\)",
    "2.345.678",
    "1000000000",
    "1.000.000",
    "das 10:30 às 12:45",
    "12 + 3456 + 7890",
    "\\(45 \\times 1234\\)",
  ])("não casa: %s", (text) => {
    expect(findPersonalDataExcerpt(text)).toBeNull();
  });
});

describe("link externo", () => {
  it.each([
    "acesse https://site.com",
    "veja www.exemplo.com.br",
    "no site escola.com.br",
    "siga @gizito_oficial",
  ])("casa: %s", (text) => {
    expect(findExternalLinkExcerpt(text)).not.toBeNull();
  });

  it.each(["R$ 12,50", "1.250,75", "ana@escola.com.br", "Fim. Comece de novo.", "3.5 e 2.7"])(
    "não casa: %s",
    (text) => {
      expect(findExternalLinkExcerpt(text)).toBeNull();
    },
  );
});

describe("termos bloqueados e dica no simulado (palavra inteira)", () => {
  it.each([
    "O computador ficou ligado",
    "A disputa foi justa",
    "O pica-pau bicou a árvore",
    "O pinto piou",
    "O burro carregou a carga",
    "O veado correu",
    "A piranha nadou",
    "Ele computou os votos",
  ])("termo bloqueado não casa: %s", (text) => {
    expect(findBlockedTermExcerpt(text)).toBeNull();
  });

  it("termo bloqueado casa como palavra inteira, sem acento nem maiúscula", () => {
    expect(findBlockedTermExcerpt("Que MERDA de dia")).toBe("MERDA");
    expect(findBlockedTermExcerpt("Ele é um idiota.")).toBe("idiota");
  });

  it("dica no simulado casa frase inteira", () => {
    expect(findMockHintExcerpt("Lembre-se da regra")).toBe("Lembre-se");
    expect(findMockHintExcerpt("Volte à revisão e responda")).toBe("Volte à revisão");
    expect(findMockHintExcerpt("Como no exemplo 1, calcule")).toBe("Como no exemplo");
    expect(findMockHintExcerpt("Use a dica: comece pelas dezenas")).toBe("dica");
    expect(findMockHintExcerpt("Ana indicava o caminho")).toBeNull();
    expect(findMockHintExcerpt("Lembre o nome do rio")).toBeNull();
  });
});

describe("delimitadores e espaçamento", () => {
  it("marcação matemática pareada", () => {
    expect(hasBalancedMathMarkup("sem marcação")).toBe(true);
    expect(hasBalancedMathMarkup("\\(1\\) e \\(2\\)")).toBe(true);
    expect(hasBalancedMathMarkup("\\(1")).toBe(false);
    expect(hasBalancedMathMarkup("1\\)")).toBe(false);
    expect(hasBalancedMathMarkup("\\(\\(1\\)\\)")).toBe(false);
  });

  it("normalizeSpacing só junta espaços e compõe acentos", () => {
    expect(normalizeSpacing("  Está   bem\n ")).toBe("Está bem");
    expect(normalizeSpacing("Está")).toBe("Está");
    expect(normalizeSpacing("Brasil")).not.toBe(normalizeSpacing("brasil"));
  });
});

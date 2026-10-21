import { describe, expect, it } from "bun:test";
import {
  DEFAULT_REGRESSION_CONCURRENCY,
  DEFAULT_USD_BRL_RATE,
  parseRegressionArgs,
} from "#src/regression/regression-input.ts";

describe("opções do bun run test:pedagogy (spec F1-10, RF-04)", () => {
  it("sem opção, roda todos os casos com os padrões", () => {
    expect(parseRegressionArgs([])).toEqual({
      ok: true,
      value: {
        caseIdList: null,
        concurrency: DEFAULT_REGRESSION_CONCURRENCY,
        usdBrlRate: DEFAULT_USD_BRL_RATE,
        preparePhotosOnly: false,
        outputDirectory: null,
      },
    });
  });

  it("aceita casos repetidos na linha, câmbio com vírgula, só preparar fotos e pasta de saída", () => {
    const parsed = parseRegressionArgs([
      "--case",
      "5-math-a",
      "--case",
      "6-math-b",
      "--concurrency",
      "2",
      "--usd-brl",
      "5,45",
      "--prepare-photos",
      "--out",
      "tests/pedagogy/output/regressao/x",
    ]);
    expect(parsed).toEqual({
      ok: true,
      value: {
        caseIdList: ["5-math-a", "6-math-b"],
        concurrency: 2,
        usdBrlRate: 5.45,
        preparePhotosOnly: true,
        outputDirectory: "tests/pedagogy/output/regressao/x",
      },
    });
  });

  it("recusa concorrência fora de 1 a 8, câmbio fora da faixa e caso repetido", () => {
    for (const concurrency of ["0", "9", "2.5", "dois"]) {
      expect(parseRegressionArgs(["--concurrency", concurrency])).toEqual({
        ok: false,
        error: ["--concurrency aceita de 1 a 8"],
      });
    }
    expect(parseRegressionArgs(["--usd-brl", "0,5"])).toEqual({
      ok: false,
      error: ["--usd-brl aceita de 1 a 20"],
    });
    expect(parseRegressionArgs(["--case", "5-math-a", "--case", "5-math-a"])).toEqual({
      ok: false,
      error: ["--case repete caso"],
    });
  });

  it("recusa opção desconhecida e caminho solto", () => {
    expect(parseRegressionArgs(["--fotos", "x"]).ok).toBe(false);
    expect(parseRegressionArgs(["solto"]).ok).toBe(false);
  });
});

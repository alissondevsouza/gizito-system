import { parseArgs } from "node:util";
import { err, ok, type Result } from "@gizito/core";

export const DEFAULT_REGRESSION_CONCURRENCY = 4;
export const MAX_REGRESSION_CONCURRENCY = 8;
export const DEFAULT_USD_BRL_RATE = 6;
const MIN_USD_BRL_RATE = 1;
const MAX_USD_BRL_RATE = 20;

export type RegressionArgs = {
  readonly caseIdList: readonly string[] | null;
  readonly concurrency: number;
  readonly usdBrlRate: number;
  readonly preparePhotosOnly: boolean;
  readonly outputDirectory: string | null;
};

export const REGRESSION_USAGE = [
  "uso: bun run test:pedagogy [opções]",
  "",
  "  --case            id de um caso de tests/pedagogy/cases/; repetível; sem ele, todos os casos",
  `  --concurrency     casos ao mesmo tempo, de 1 a ${MAX_REGRESSION_CONCURRENCY}; padrão ${DEFAULT_REGRESSION_CONCURRENCY}`,
  `  --usd-brl         reais por dólar para os critérios de custo; padrão ${DEFAULT_USD_BRL_RATE}`,
  "  --prepare-photos  só copia as imagens, gera as variações e confere os hashes",
  "  --out             pasta de saída; padrão tests/pedagogy/output/regressao/<data-hora>/",
  "",
  "A rodada completa grava o resumo em docs/pedagogy/regressao/. O render e as variações precisam do Chromium: bun run --cwd apps/worker browser:install",
].join("\n");

const optionMap = {
  case: { type: "string", multiple: true },
  concurrency: { type: "string" },
  "usd-brl": { type: "string" },
  "prepare-photos": { type: "boolean" },
  out: { type: "string" },
} as const;

function readOptionValues(argv: readonly string[]) {
  try {
    return ok(parseArgs({ args: [...argv], options: optionMap, strict: true }).values);
  } catch (error) {
    return err([error instanceof Error ? error.message : "opção inválida"]);
  }
}

function parseNumber(text: string): number {
  return /^\d+(?:[.,]\d+)?$/.test(text) ? Number(text.replace(",", ".")) : Number.NaN;
}

export function parseRegressionArgs(
  argv: readonly string[],
): Result<RegressionArgs, readonly string[]> {
  const read = readOptionValues(argv);
  if (!read.ok) return read;
  const values = read.value;
  const errorList: string[] = [];
  const concurrency =
    values.concurrency === undefined
      ? DEFAULT_REGRESSION_CONCURRENCY
      : parseNumber(values.concurrency);
  if (
    !Number.isInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > MAX_REGRESSION_CONCURRENCY
  ) {
    errorList.push(`--concurrency aceita de 1 a ${MAX_REGRESSION_CONCURRENCY}`);
  }
  const usdBrlRate =
    values["usd-brl"] === undefined ? DEFAULT_USD_BRL_RATE : parseNumber(values["usd-brl"]);
  if (!(usdBrlRate >= MIN_USD_BRL_RATE && usdBrlRate <= MAX_USD_BRL_RATE)) {
    errorList.push(`--usd-brl aceita de ${MIN_USD_BRL_RATE} a ${MAX_USD_BRL_RATE}`);
  }
  const caseIdList = values.case ?? null;
  if (caseIdList !== null && new Set(caseIdList).size !== caseIdList.length) {
    errorList.push("--case repete caso");
  }
  if (errorList.length > 0) return err(errorList);
  return ok({
    caseIdList,
    concurrency,
    usdBrlRate,
    preparePhotosOnly: values["prepare-photos"] ?? false,
    outputDirectory: values.out ?? null,
  });
}

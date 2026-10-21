import katex from "katex";

const DECIMAL_COMMA_PATTERN = /(\d),(?=\d)/g;
const BARE_PERCENT_PATTERN = /(?<!\\)%/g;

export function isKatexParsable(latex: string): boolean {
  try {
    katex.renderToString(latex, { throwOnError: true, strict: "ignore" });
    return true;
  } catch (error) {
    if (error instanceof katex.ParseError) return false;
    throw error;
  }
}

export function renderMathMarkup(latex: string): string {
  const source = latex.replace(DECIMAL_COMMA_PATTERN, "$1{,}").replace(BARE_PERCENT_PATTERN, "\\%");
  return katex.renderToString(`\\displaystyle ${source}`, {
    output: "html",
    throwOnError: true,
    strict: "ignore",
    trust: false,
  });
}

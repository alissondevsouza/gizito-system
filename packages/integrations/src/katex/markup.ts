import katex from "katex";

const DECIMAL_COMMA_PATTERN = /(\d),(?=\d)/g;

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
  return katex.renderToString(`\\displaystyle ${latex.replace(DECIMAL_COMMA_PATTERN, "$1{,}")}`, {
    output: "html",
    throwOnError: true,
    strict: "ignore",
    trust: false,
  });
}

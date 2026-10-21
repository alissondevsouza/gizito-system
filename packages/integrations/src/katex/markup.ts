import katex from "katex";

export function isKatexParsable(latex: string): boolean {
  try {
    katex.renderToString(latex, { throwOnError: true, strict: "ignore" });
    return true;
  } catch (error) {
    if (error instanceof katex.ParseError) return false;
    throw error;
  }
}

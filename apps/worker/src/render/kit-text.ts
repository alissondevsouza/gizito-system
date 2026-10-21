import { type ExpectedAnswer, formatExpectedAnswer, splitMathMarkup } from "@gizito/core";
import { mathExpressionToLatex, renderMathMarkup } from "@gizito/integrations";
import { escapeHtml, type SafeHtml, trustedHtml } from "#src/render/html.ts";

export class UnrenderableExpressionError extends Error {
  override readonly name = "UnrenderableExpressionError";
}

function plainTextHtml(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, "<br>");
}

export function kitTextHtml(text: string): SafeHtml {
  return trustedHtml(
    splitMathMarkup(text)
      .map((part) =>
        part.kind === "math" ? renderMathMarkup(part.value) : plainTextHtml(part.value),
      )
      .join(""),
  );
}

function expressionLatex(expression: string): string {
  const latex = mathExpressionToLatex(expression);
  if (!latex.ok) throw new UnrenderableExpressionError(latex.error.code);
  return latex.value;
}

export function expectedAnswerHtml(answer: ExpectedAnswer): SafeHtml {
  return kitTextHtml(formatExpectedAnswer(answer, { formatExpression: expressionLatex }));
}

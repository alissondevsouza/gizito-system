import type { MathEvaluator } from "#src/interfaces/math-evaluator.ts";
import type { ExpectedAnswer } from "#src/pedagogy/expected-answer.ts";
import { normalizeSpacing } from "#src/pedagogy/validation/patterns.ts";
import { err, ok } from "#src/result.ts";

const EPSILON = 1e-9;

function numericValueOf(answer: ExpectedAnswer): number | null {
  if (answer.kind === "number") return answer.value;
  return answer.kind === "fraction" ? answer.numerator / answer.denominator : null;
}

function toleranceOf(answer: ExpectedAnswer): number {
  return answer.kind === "number" ? answer.tolerance : 0;
}

function unitOf(answer: ExpectedAnswer): string | null {
  return answer.kind === "number" || answer.kind === "fraction" ? answer.unit : null;
}

export function tableEquals(left: ExpectedAnswer, right: ExpectedAnswer): boolean {
  const leftValue = numericValueOf(left);
  const rightValue = numericValueOf(right);
  if (leftValue !== null && rightValue !== null) {
    return (
      unitOf(left) === unitOf(right) &&
      Math.abs(leftValue - rightValue) <= Math.max(toleranceOf(left), toleranceOf(right)) + EPSILON
    );
  }
  if (left.kind === "text" && right.kind === "text") {
    return normalizeSpacing(left.value) === normalizeSpacing(right.value);
  }
  if (left.kind === "set" && right.kind === "set") {
    return [...left.valueList].sort().join("\n") === [...right.valueList].sort().join("\n");
  }
  if (left.kind === "expression" && right.kind === "expression") {
    return left.expression.replace(/\s+/g, "") === right.expression.replace(/\s+/g, "");
  }
  return false;
}

export function createTableMathEvaluator(
  resultByExpression: ReadonlyMap<string, ExpectedAnswer>,
): MathEvaluator {
  return {
    evaluate: (expression) => {
      if (expression.includes("Infinity")) return err({ code: "not_finite", expression });
      const result = resultByExpression.get(expression);
      return result === undefined ? err({ code: "parse_error", expression }) : ok(result);
    },
    equals: tableEquals,
  };
}

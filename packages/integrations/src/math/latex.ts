import {
  err,
  formatBrazilianDecimal,
  type MathEvaluationError,
  ok,
  type Result,
} from "@gizito/core";
import {
  isConstantNode,
  isFunctionNode,
  isOperatorNode,
  isParenthesisNode,
  isSymbolNode,
  type MathNode,
} from "mathjs";
import { parseMathExpression } from "#src/math/expression.ts";

type TexOption = {
  readonly parenthesis: "auto";
  readonly handler: (node: MathNode, option: TexOption) => string | undefined;
};

function isJuxtaposedFactor(node: MathNode): boolean {
  if (isSymbolNode(node) || isParenthesisNode(node) || isFunctionNode(node)) {
    return true;
  }
  return isOperatorNode(node) && node.fn === "pow" && isSymbolNode(node.args[0]);
}

function factorTex(node: MathNode, option: TexOption): string {
  return isParenthesisNode(node)
    ? `\\left(${node.content.toTex(option)}\\right)`
    : node.toTex(option);
}

function multiplicationTex(left: MathNode, right: MathNode, option: TexOption): string {
  const operator = isJuxtaposedFactor(right) ? "" : "\\times";
  return `${factorTex(left, option)}${operator}${factorTex(right, option)}`;
}

function brazilianTex(node: MathNode, option: TexOption): string | undefined {
  if (isConstantNode(node) && typeof node.value === "number") {
    return formatBrazilianDecimal(node.value, null);
  }
  if (isOperatorNode(node) && node.fn === "multiply") {
    const [left, right] = node.args;
    return left !== undefined && right !== undefined
      ? multiplicationTex(left, right, option)
      : undefined;
  }
  return undefined;
}

const texOption: TexOption = { parenthesis: "auto", handler: brazilianTex };

export function mathExpressionToLatex(expression: string): Result<string, MathEvaluationError> {
  const parsed = parseMathExpression(expression);
  return parsed.ok
    ? ok(parsed.value.node.toTex(texOption))
    : err({ code: parsed.error, expression });
}

import {
  err,
  formatBrazilianDecimal,
  type MathEvaluationError,
  ok,
  type Result,
} from "@gizito/core";
import {
  type FunctionNode,
  isConstantNode,
  isFunctionNode,
  isOperatorNode,
  isParenthesisNode,
  isSymbolNode,
  type MathNode,
  type OperatorNode,
  type OperatorNodeFn,
  type OperatorNodeOp,
} from "mathjs";
import { parseMathExpression } from "#src/math/expression.ts";

type TexOption = {
  readonly parenthesis: "auto";
  readonly handler: (node: MathNode, option: TexOption) => string | undefined;
};

const functionNameTexMap: Readonly<Record<string, string>> = {
  gcd: "\\text{mdc}",
  lcm: "\\text{mmc}",
};

const FUNCTION_ARGUMENT_SEPARATOR = ";";

function wrappedTex(node: MathNode, option: TexOption): string {
  return `\\left(${node.toTex(option)}\\right)`;
}

function negativeOperandOf(node: MathNode): MathNode | null {
  const content = isParenthesisNode(node) ? node.content : node;
  return isOperatorNode(content) && content.fn === "unaryMinus" ? content : null;
}

function isJuxtaposedFactor(node: MathNode): boolean {
  if (isSymbolNode(node) || isParenthesisNode(node) || isFunctionNode(node)) {
    return true;
  }
  return isOperatorNode(node) && node.fn === "pow" && isSymbolNode(node.args[0]);
}

function leftFactorTex(node: MathNode, option: TexOption): string {
  return isParenthesisNode(node) ? wrappedTex(node.content, option) : node.toTex(option);
}

function rightFactorTex(node: MathNode, option: TexOption): string {
  const negative = negativeOperandOf(node);
  if (negative !== null) return wrappedTex(negative, option);
  return leftFactorTex(node, option);
}

function multiplicationTex(left: MathNode, right: MathNode, option: TexOption): string {
  const operator = isJuxtaposedFactor(right) && negativeOperandOf(right) === null ? "" : "\\times";
  return `${leftFactorTex(left, option)}${operator}${rightFactorTex(right, option)}`;
}

function operatorTex(
  node: OperatorNode<OperatorNodeOp, OperatorNodeFn>,
  option: TexOption,
): string | undefined {
  const [left, right] = node.args;
  if (node.fn === "unaryMinus" && left !== undefined) {
    const negative = negativeOperandOf(left);
    return negative === null ? undefined : `-${wrappedTex(negative, option)}`;
  }
  if (left === undefined || right === undefined) return undefined;
  if (node.fn === "multiply") return multiplicationTex(left, right, option);
  if (node.fn !== "add" && node.fn !== "subtract") return undefined;
  const negative = negativeOperandOf(right);
  return negative === null
    ? undefined
    : `${left.toTex(option)}${node.op}${wrappedTex(negative, option)}`;
}

function functionTex(node: FunctionNode, option: TexOption): string | undefined {
  const name = node.fn.name;
  if (node.args.length < 2 || name === "mod") return undefined;
  const argumentTex = node.args
    .map((argument) => argument.toTex(option))
    .join(FUNCTION_ARGUMENT_SEPARATOR);
  return `${functionNameTexMap[name] ?? `\\operatorname{${name}}`}\\left(${argumentTex}\\right)`;
}

function texOptionOf(variableList: readonly string[]): TexOption {
  const handler = (node: MathNode, option: TexOption): string | undefined => {
    if (isConstantNode(node) && typeof node.value === "number") {
      return formatBrazilianDecimal(node.value, null);
    }
    if (isSymbolNode(node)) return variableList.includes(node.name) ? ` ${node.name}` : undefined;
    if (isOperatorNode(node)) return operatorTex(node, option);
    return isFunctionNode(node) ? functionTex(node, option) : undefined;
  };
  return { parenthesis: "auto", handler };
}

export function mathExpressionToLatex(expression: string): Result<string, MathEvaluationError> {
  const parsed = parseMathExpression(expression);
  return parsed.ok
    ? ok(parsed.value.node.toTex(texOptionOf(parsed.value.variableList)))
    : err({ code: parsed.error, expression });
}

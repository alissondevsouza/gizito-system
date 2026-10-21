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
import { type ParsedExpression, parseMathExpression } from "#src/math/expression.ts";

type TexOption = {
  readonly parenthesis: "auto";
  readonly handler: (node: MathNode, option: TexOption) => string | undefined;
};

const functionNameTexMap: Readonly<Record<string, string>> = {
  gcd: "\\text{mdc}",
  lcm: "\\text{mmc}",
  min: "\\min",
  max: "\\max",
};

const FUNCTION_ARGUMENT_SEPARATOR = ";";

function wrappedTex(node: MathNode, option: TexOption): string {
  return `\\left(${node.toTex(option)}\\right)`;
}

function startsWithSign(node: MathNode): boolean {
  if (!isOperatorNode(node)) return false;
  if (node.fn === "unaryMinus" || node.fn === "unaryPlus") return true;
  const [first] = node.args;
  return node.fn !== "divide" && first !== undefined && startsWithSign(first);
}

function contentOf(node: MathNode): MathNode {
  return isParenthesisNode(node) ? node.content : node;
}

function rightOperandTex(node: MathNode, option: TexOption): string {
  if (isParenthesisNode(node)) return wrappedTex(node.content, option);
  return startsWithSign(node) ? wrappedTex(node, option) : node.toTex(option);
}

function isJuxtaposedFactor(node: MathNode): boolean {
  if (startsWithSign(contentOf(node))) return false;
  if (isSymbolNode(node) || isParenthesisNode(node) || isFunctionNode(node)) {
    return true;
  }
  return isOperatorNode(node) && node.fn === "pow" && isSymbolNode(node.args[0]);
}

function leftFactorTex(node: MathNode, option: TexOption): string {
  return isParenthesisNode(node) ? wrappedTex(node.content, option) : node.toTex(option);
}

function operatorTex(
  node: OperatorNode<OperatorNodeOp, OperatorNodeFn>,
  option: TexOption,
): string | undefined {
  const [left, right] = node.args;
  if (node.fn === "unaryMinus" && left !== undefined && right === undefined) {
    return `-${rightOperandTex(left, option)}`;
  }
  if (left === undefined || right === undefined) return undefined;
  if (node.fn === "multiply") {
    const operator = isJuxtaposedFactor(right) ? "" : "\\times";
    return `${leftFactorTex(left, option)}${operator}${rightOperandTex(right, option)}`;
  }
  return node.fn === "add" || node.fn === "subtract"
    ? `${left.toTex(option)}${node.op}${rightOperandTex(right, option)}`
    : undefined;
}

const singleArgumentTexMap: Readonly<Record<string, (argumentTex: string) => string>> = {
  sqrt: (argumentTex) => `\\sqrt{${argumentTex}}`,
  abs: (argumentTex) => `\\left|${argumentTex}\\right|`,
  floor: (argumentTex) => `\\left\\lfloor ${argumentTex}\\right\\rfloor`,
  ceil: (argumentTex) => `\\left\\lceil ${argumentTex}\\right\\rceil`,
  round: (argumentTex) => `\\left\\lfloor ${argumentTex}\\right\\rceil`,
};

function functionTex(node: FunctionNode, option: TexOption): string {
  const name = node.fn.name;
  const argumentTexList = node.args.map((argument) => argument.toTex(option));
  const [first, second] = argumentTexList;
  const singleArgumentTex = singleArgumentTexMap[name];
  if (argumentTexList.length === 1 && first !== undefined && singleArgumentTex !== undefined) {
    return singleArgumentTex(first);
  }
  if (name === "mod" && argumentTexList.length === 2) {
    return `\\left(${first}\\bmod ${second}\\right)`;
  }
  const nameTex = functionNameTexMap[name] ?? `\\operatorname{${name}}`;
  return `${nameTex}\\left(${argumentTexList.join(FUNCTION_ARGUMENT_SEPARATOR)}\\right)`;
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

function latexOf(parsed: ParsedExpression): string {
  return parsed.node.toTex(texOptionOf(parsed.variableList));
}

export function mathExpressionToLatex(expression: string): Result<string, MathEvaluationError> {
  const algebraic = parseMathExpression(expression, "algebra");
  if (algebraic.ok) return ok(latexOf(algebraic.value));
  const measured = parseMathExpression(expression, "measure");
  return measured.ok ? ok(latexOf(measured.value)) : err({ code: measured.error, expression });
}

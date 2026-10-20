import { err, type MathEvaluationErrorCode, ok, type Result } from "@gizito/core";
import {
  isConstantNode,
  isFunctionNode,
  isOperatorNode,
  isParenthesisNode,
  isSymbolNode,
  type MathNode,
  parse,
} from "mathjs";
import { expressionUnitSymbolSet } from "#src/math/units.ts";

export type ParsedExpression = {
  readonly node: MathNode;
  readonly unitSymbolList: readonly string[];
  readonly variableList: readonly string[];
};

const allowedOperatorSet: ReadonlySet<string> = new Set([
  "add",
  "subtract",
  "multiply",
  "divide",
  "pow",
  "unaryMinus",
  "unaryPlus",
  "mod",
  "to",
]);

const allowedFunctionSet: ReadonlySet<string> = new Set([
  "sqrt",
  "abs",
  "floor",
  "ceil",
  "round",
  "mod",
  "gcd",
  "lcm",
]);

const ALLOWED_CONSTANT = "pi";

const VARIABLE_PATTERN = /^[a-z]$/;

type SymbolCollector = {
  readonly isUnitContext: boolean;
  readonly unitSymbolSet: Set<string>;
  readonly variableSet: Set<string>;
};

function isUnitFactor(node: MathNode): boolean {
  const base = isOperatorNode(node) && node.fn === "pow" ? node.args[0] : node;
  return isSymbolNode(base) && expressionUnitSymbolSet.has(base.name);
}

function hasUnitContext(node: MathNode): boolean {
  if (isSymbolNode(node)) return expressionUnitSymbolSet.has(node.name) && node.name.length > 1;
  if (isParenthesisNode(node)) return hasUnitContext(node.content);
  if (isFunctionNode(node)) return node.args.some(hasUnitContext);
  if (!isOperatorNode(node)) return false;
  const [, right] = node.args;
  const isUnitAfterNumber =
    node.fn === "multiply" && node.implicit && right !== undefined && isUnitFactor(right);
  return node.fn === "to" || isUnitAfterNumber || node.args.some(hasUnitContext);
}

function collectSymbol(name: string, collector: SymbolCollector): boolean {
  if (collector.isUnitContext && expressionUnitSymbolSet.has(name)) {
    collector.unitSymbolSet.add(name);
    return true;
  }
  if (name === ALLOWED_CONSTANT) return true;
  if (VARIABLE_PATTERN.test(name)) {
    collector.variableSet.add(name);
    return true;
  }
  return false;
}

function isAllowedNode(node: MathNode, collector: SymbolCollector): boolean {
  if (isConstantNode(node)) return typeof node.value === "number";
  if (isSymbolNode(node)) return collectSymbol(node.name, collector);
  if (isParenthesisNode(node)) return isAllowedNode(node.content, collector);
  if (isOperatorNode(node)) {
    return (
      allowedOperatorSet.has(node.fn) && node.args.every((arg) => isAllowedNode(arg, collector))
    );
  }
  if (isFunctionNode(node)) {
    return (
      isSymbolNode(node.fn) &&
      allowedFunctionSet.has(node.fn.name) &&
      node.args.every((arg) => isAllowedNode(arg, collector))
    );
  }
  return false;
}

function parseNode(expression: string): MathNode | null {
  if (expression.trim() === "") return null;
  try {
    return parse(expression);
  } catch {
    return null;
  }
}

export function parseMathExpression(
  expression: string,
): Result<ParsedExpression, MathEvaluationErrorCode> {
  const node = parseNode(expression);
  if (node === null) return err("parse_error");
  const collector: SymbolCollector = {
    isUnitContext: hasUnitContext(node),
    unitSymbolSet: new Set(),
    variableSet: new Set(),
  };
  if (!isAllowedNode(node, collector)) return err("unsupported");
  if (collector.unitSymbolSet.size > 0 && collector.variableSet.size > 0) {
    return err("unsupported");
  }
  return ok({
    node,
    unitSymbolList: [...collector.unitSymbolSet],
    variableList: [...collector.variableSet].sort(),
  });
}

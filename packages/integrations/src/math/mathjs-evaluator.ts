import {
  type ExpectedAnswer,
  err,
  type MathEvaluationErrorCode,
  type MathEvaluator,
  normalizeSpacing,
  ok,
  type Result,
} from "@gizito/core";
import { unit as createUnit, isUnit, type MathNode, simplify } from "mathjs";
import { type ParsedExpression, parseMathExpression } from "#src/math/expression.ts";
import {
  convertUnitValue,
  findResultUnitEntry,
  findUnitEntry,
  isSameDimension,
  normalizeUnitText,
  type UnitEntry,
  unitEntryList,
} from "#src/math/units.ts";

const SIGNIFICANT_DIGIT_COUNT = 15;
const RELATIVE_EPSILON = 1e-9;
const SAMPLE_POINT_LIST: readonly number[] = [0.7, 1.3, 2.9, -1.7, 3.1, -2.3];
const MIN_VALID_SAMPLE_COUNT = 3;

type NumericValue = {
  readonly value: number;
  readonly unit: string | null;
  readonly tolerance: number;
};

type TextAnswer = Extract<ExpectedAnswer, { kind: "text" }>;

function roundSignificant(value: number): number {
  const rounded = Number(value.toPrecision(SIGNIFICANT_DIGIT_COUNT));
  return rounded === 0 ? 0 : rounded;
}

function evaluateNode(
  node: MathNode,
  scope: ReadonlyMap<string, unknown>,
): Result<unknown, MathEvaluationErrorCode> {
  try {
    return ok(node.evaluate(new Map(scope)));
  } catch {
    return err("unsupported");
  }
}

function evaluateNumeric(parsed: ParsedExpression): Result<NumericValue, MathEvaluationErrorCode> {
  const unitScope = new Map(parsed.unitSymbolList.map((symbol) => [symbol, createUnit(symbol)]));
  const evaluated = evaluateNode(parsed.node, unitScope);
  if (!evaluated.ok) return evaluated;
  const result = evaluated.value;
  if (typeof result === "number") {
    return Number.isFinite(result)
      ? ok({ value: roundSignificant(result), unit: null, tolerance: 0 })
      : err("not_finite");
  }
  if (!isUnit(result) || typeof result.value !== "number") return err("unsupported");
  const entry = findResultUnitEntry(result);
  if (entry === null) return err("unsupported");
  const value = result.toNumber(entry.mathjsUnit);
  return Number.isFinite(value)
    ? ok({ value: roundSignificant(value), unit: entry.displayUnit, tolerance: 0 })
    : err("not_finite");
}

function simplifyExpression(parsed: ParsedExpression): Result<string, MathEvaluationErrorCode> {
  try {
    return ok(simplify(parsed.node).toString());
  } catch {
    return err("unsupported");
  }
}

function evaluateParsed(parsed: ParsedExpression): Result<ExpectedAnswer, MathEvaluationErrorCode> {
  if (parsed.variableList.length > 0) {
    const simplified = simplifyExpression(parsed);
    return simplified.ok ? ok({ kind: "expression", expression: simplified.value }) : simplified;
  }
  const numeric = evaluateNumeric(parsed);
  return numeric.ok ? ok({ kind: "number", ...numeric.value }) : numeric;
}

function isClose(left: number, right: number, tolerance: number): boolean {
  const epsilon = RELATIVE_EPSILON * Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= tolerance + epsilon;
}

function numericValueOf(answer: ExpectedAnswer): NumericValue | null {
  switch (answer.kind) {
    case "number":
      return answer;
    case "fraction":
      return { value: answer.numerator / answer.denominator, unit: answer.unit, tolerance: 0 };
    case "expression": {
      const parsed = parseMathExpression(answer.expression);
      if (!parsed.ok || parsed.value.variableList.length > 0) return null;
      const numeric = evaluateNumeric(parsed.value);
      return numeric.ok ? numeric.value : null;
    }
    default:
      return null;
  }
}

function commonUnitEntryOf(left: UnitEntry, right: UnitEntry): UnitEntry {
  return unitEntryList.indexOf(left) <= unitEntryList.indexOf(right) ? left : right;
}

function isSameOpaqueUnit(left: string, right: string): boolean {
  return normalizeUnitText(left) === normalizeUnitText(right);
}

function numericEquals(left: NumericValue, right: NumericValue): boolean {
  if (left.unit === null || right.unit === null) {
    return isClose(left.value, right.value, Math.max(left.tolerance, right.tolerance));
  }
  const leftEntry = findUnitEntry(left.unit);
  const rightEntry = findUnitEntry(right.unit);
  if (leftEntry === null || rightEntry === null) {
    return (
      leftEntry === rightEntry &&
      isSameOpaqueUnit(left.unit, right.unit) &&
      isClose(left.value, right.value, Math.max(left.tolerance, right.tolerance))
    );
  }
  if (!isSameDimension(leftEntry, rightEntry)) return false;
  const commonEntry = commonUnitEntryOf(leftEntry, rightEntry);
  return isClose(
    convertUnitValue(left.value, leftEntry, commonEntry),
    convertUnitValue(right.value, rightEntry, commonEntry),
    Math.max(
      convertUnitValue(left.tolerance, leftEntry, commonEntry),
      convertUnitValue(right.tolerance, rightEntry, commonEntry),
    ),
  );
}

function variableExpressionOf(answer: ExpectedAnswer): ParsedExpression | null {
  if (answer.kind !== "expression") return null;
  const parsed = parseMathExpression(answer.expression);
  return parsed.ok && parsed.value.variableList.length > 0 ? parsed.value : null;
}

function sampleValue(node: MathNode, scope: ReadonlyMap<string, number>): number | null {
  const evaluated = evaluateNode(node, scope);
  return evaluated.ok && typeof evaluated.value === "number" && Number.isFinite(evaluated.value)
    ? evaluated.value
    : null;
}

function sampleScopeOf(
  variableList: readonly string[],
  pointIndex: number,
): ReadonlyMap<string, number> {
  return new Map(
    variableList.map((variable, variableIndex) => [
      variable,
      SAMPLE_POINT_LIST[(pointIndex + variableIndex) % SAMPLE_POINT_LIST.length] ?? 0,
    ]),
  );
}

function symbolicEquals(left: ParsedExpression, right: ParsedExpression): boolean {
  const variableList = [...new Set([...left.variableList, ...right.variableList])].sort();
  const comparisonList = SAMPLE_POINT_LIST.flatMap((_, pointIndex) => {
    const scope = sampleScopeOf(variableList, pointIndex);
    const leftValue = sampleValue(left.node, scope);
    const rightValue = sampleValue(right.node, scope);
    return leftValue === null || rightValue === null ? [] : [isClose(leftValue, rightValue, 0)];
  });
  return comparisonList.length >= MIN_VALID_SAMPLE_COUNT && comparisonList.every(Boolean);
}

const BRAZILIAN_NUMBER_PATTERN = /^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/;
const FRACTION_TEXT_PATTERN = /^(-?\d+) ?\/ ?(\d+)$/;

function normalizeAnswerText(text: string): string {
  return normalizeSpacing(text).toLocaleLowerCase("pt-BR");
}

function setElementOf(text: string): number | string {
  const normalized = normalizeAnswerText(text);
  if (BRAZILIAN_NUMBER_PATTERN.test(normalized)) {
    return Number(normalized.replace(/\./g, "").replace(",", "."));
  }
  const [, numerator = "", denominator = "0"] = FRACTION_TEXT_PATTERN.exec(normalized) ?? [];
  return Number(denominator) === 0 ? normalized : Number(numerator) / Number(denominator);
}

function isSameSetElement(left: number | string, right: number | string): boolean {
  return typeof left === "number" && typeof right === "number"
    ? isClose(left, right, 0)
    : left === right;
}

function containsEvery(
  sourceList: readonly (number | string)[],
  targetList: readonly (number | string)[],
): boolean {
  return sourceList.every((source) =>
    targetList.some((target) => isSameSetElement(source, target)),
  );
}

function setEquals(left: readonly string[], right: readonly string[]): boolean {
  const leftElementList = left.map(setElementOf);
  const rightElementList = right.map(setElementOf);
  return (
    containsEvery(leftElementList, rightElementList) &&
    containsEvery(rightElementList, leftElementList)
  );
}

function textCandidateListOf(answer: TextAnswer): readonly string[] {
  return [answer.value, ...answer.acceptedList].map(normalizeAnswerText);
}

function textEquals(left: TextAnswer, right: TextAnswer): boolean {
  const rightCandidateList = textCandidateListOf(right);
  return textCandidateListOf(left).some((candidate) => rightCandidateList.includes(candidate));
}

function compactExpression(expression: string): string {
  return expression.replace(/\s+/g, "");
}

function equalsExpectedAnswer(left: ExpectedAnswer, right: ExpectedAnswer): boolean {
  if (left.kind === "set" || right.kind === "set") {
    return (
      left.kind === "set" && right.kind === "set" && setEquals(left.valueList, right.valueList)
    );
  }
  if (left.kind === "text" || right.kind === "text") {
    return left.kind === "text" && right.kind === "text" && textEquals(left, right);
  }
  const leftNumeric = numericValueOf(left);
  const rightNumeric = numericValueOf(right);
  if (leftNumeric !== null && rightNumeric !== null)
    return numericEquals(leftNumeric, rightNumeric);
  const leftVariable = variableExpressionOf(left);
  const rightVariable = variableExpressionOf(right);
  if (
    leftVariable !== null &&
    rightVariable !== null &&
    symbolicEquals(leftVariable, rightVariable)
  ) {
    return true;
  }
  return (
    left.kind === "expression" &&
    right.kind === "expression" &&
    compactExpression(left.expression) === compactExpression(right.expression)
  );
}

export function createMathjsEvaluator(): MathEvaluator {
  return {
    evaluate: (expression) => {
      const parsed = parseMathExpression(expression);
      const evaluated = parsed.ok ? evaluateParsed(parsed.value) : parsed;
      return evaluated.ok ? evaluated : err({ code: evaluated.error, expression });
    },
    equals: equalsExpectedAnswer,
  };
}

import { z } from "zod";
import type { ExpectedAnswer } from "#src/pedagogy/expected-answer.ts";
import type { Result } from "#src/result.ts";

export const mathEvaluationErrorCodeList = ["parse_error", "unsupported", "not_finite"] as const;
export const mathEvaluationErrorCodeSchema = z.enum(mathEvaluationErrorCodeList);
export type MathEvaluationErrorCode = z.infer<typeof mathEvaluationErrorCodeSchema>;

export type MathEvaluationError = {
  readonly code: MathEvaluationErrorCode;
  readonly expression: string;
};

export interface MathEvaluator {
  evaluate(expression: string): Result<ExpectedAnswer, MathEvaluationError>;
  equals(left: ExpectedAnswer, right: ExpectedAnswer): boolean;
}

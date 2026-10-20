import type { MathEvaluator } from "#src/interfaces/math-evaluator.ts";
import type { StudyKit } from "#src/pedagogy/kit/schemas.ts";
import type { ValidationIssue } from "#src/pedagogy/validation/issue.ts";

export type ValidationContext = { readonly mathEvaluator: MathEvaluator };

export type KitValidationRule = (
  studyKit: StudyKit,
  context: ValidationContext,
) => readonly ValidationIssue[];

export function uniqueByCodeAndItem(issueList: readonly ValidationIssue[]): ValidationIssue[] {
  const seenKeySet = new Set<string>();
  return issueList.filter((issue) => {
    const key = `${issue.code}:${issue.itemId ?? ""}`;
    if (seenKeySet.has(key)) return false;
    seenKeySet.add(key);
    return true;
  });
}

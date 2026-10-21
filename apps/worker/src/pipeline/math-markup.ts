import {
  createValidationIssue,
  hasBalancedMathMarkup,
  listKitTextEntry,
  listMathMarkupSegment,
  type StudyKit,
  uniqueByCodeAndItem,
  type ValidationIssue,
} from "@gizito/core";

export type MathMarkupParser = (latex: string) => boolean;

export function checkMathMarkup(
  studyKit: StudyKit,
  isMathMarkupParsable: MathMarkupParser,
): readonly ValidationIssue[] {
  return uniqueByCodeAndItem(
    listKitTextEntry(studyKit).flatMap((entry) => {
      if (!hasBalancedMathMarkup(entry.text)) return [];
      const invalidSegment = listMathMarkupSegment(entry.text).find(
        (segment) => !isMathMarkupParsable(segment),
      );
      return invalidSegment === undefined
        ? []
        : [
            createValidationIssue("math_markup_invalid", {
              itemId: entry.itemId,
              excerpt: invalidSegment,
            }),
          ];
    }),
  );
}

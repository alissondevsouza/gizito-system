import { describe, expect, it } from "bun:test";
import {
  createValidationIssue,
  itemReviewCodeList,
  kitReviewCodeList,
  type ValidationIssueCode,
  type ValidationRepair,
  type ValidationSeverity,
  type ValidationStage,
  validationIssueCodeList,
  validationIssueDescriptionMap,
  validationIssueRuleMap,
  validationIssueSchema,
} from "#src/pedagogy/validation/issue.ts";

type SpecRow = readonly [ValidationIssueCode, ValidationSeverity, ValidationRepair | null];

const planRowList: readonly SpecRow[] = [
  ["plan_output_invalid", "blocker", "plan"],
  ["plan_slot_mismatch", "blocker", "plan"],
  ["plan_multiple_choice_mix", "blocker", "plan"],
  ["plan_contextualized_minority", "blocker", "plan"],
  ["plan_base_text_invalid", "blocker", "plan"],
  ["other_topic_unfeasible", "blocker", "none"],
];

const validateRowList: readonly SpecRow[] = [
  ["kit_output_invalid", "blocker", "kit"],
  ["kit_slot_mismatch", "blocker", "kit"],
  ["topic_coverage_below_minimum", "blocker", "none"],
  ["difficulty_distribution_mismatch", "blocker", "none"],
  ["option_duplicate", "blocker", "item"],
  ["correct_option_mismatch", "blocker", "item"],
  ["distractor_equivalent", "blocker", "item"],
  ["math_recalculation_mismatch", "blocker", "item"],
  ["math_expression_invalid", "blocker", "item"],
  ["example_recalculation_mismatch", "blocker", "item"],
  ["evidence_quote_not_found", "blocker", "item"],
  ["non_computable_excess", "warning", null],
  ["expression_number_not_in_statement", "warning", null],
  ["fraction_not_simplified", "warning", null],
  ["unit_missing", "warning", null],
  ["figure_reference", "blocker", "item"],
  ["personal_data_pattern", "blocker", "item"],
  ["external_link", "blocker", "item"],
  ["blocked_term", "blocker", "item"],
  ["duplicate_question", "blocker", "item"],
  ["math_markup_invalid", "blocker", "item"],
  ["similar_question", "warning", null],
  ["example_similar_to_question", "warning", null],
  ["mock_hint", "warning", null],
  ["statement_too_long", "warning", null],
  ["base_text_length", "warning", null],
  ["markup_forbidden", "blocker", "item"],
];

const reviewRowList: readonly SpecRow[] = [
  ["review_answer_mismatch", "blocker", "item"],
  ...(
    [
      "answer_incorrect",
      "answer_ambiguous",
      "explanation_inconsistent",
      "missing_data",
      "off_topic",
      "above_grade",
      "inappropriate_content",
      "personal_data",
      "evidence_unsupported",
      "example_incorrect",
    ] as const
  ).map((code): SpecRow => [`review_${code}`, "blocker", "item"]),
  ["review_kit_section_incorrect", "blocker", "item"],
  ["review_kit_base_text_inappropriate", "blocker", "item"],
  ["review_kit_off_topic", "blocker", "kit"],
  ["review_kit_above_grade", "blocker", "kit"],
  ["review_kit_inappropriate_content", "blocker", "kit"],
  ["review_kit_personal_data", "blocker", "kit"],
  ...(
    [
      "weak_distractor",
      "difficulty_mismatch",
      "hint_in_mock",
      "variety_as_error",
      "fraction_not_simplified",
      "unclear_wording",
    ] as const
  ).map((code): SpecRow => [`review_${code}`, "warning", null]),
  ["review_kit_style_mismatch", "warning", null],
];

const renderRowList: readonly SpecRow[] = [
  ["render_failed", "blocker", null],
  ["render_item_missing", "blocker", null],
  ["render_overflow", "blocker", null],
  ["page_count_out_of_range", "warning", null],
];

const extractRowList: readonly SpecRow[] = [
  ["extraction_unknown_topic", "warning", null],
  ["extraction_unknown_unsupported_topic", "warning", null],
  ["extraction_personal_data_dropped", "warning", null],
  ["extraction_output_invalid", "warning", null],
];

const stageRowList: readonly [ValidationStage, readonly SpecRow[]][] = [
  ["extract", extractRowList],
  ["plan", planRowList],
  ["validate", validateRowList],
  ["review", reviewRowList],
  ["render", renderRowList],
];

describe("registro de códigos (spec pedagógica §8)", () => {
  it("cada linha das tabelas da spec tem a severidade, a etapa e o reparo do mapa", () => {
    for (const [stage, rowList] of stageRowList) {
      for (const [code, severity, repair] of rowList) {
        expect({ code, ...validationIssueRuleMap[code] }).toEqual({
          code,
          stage,
          severity,
          repair,
        });
      }
    }
  });

  it("o registro tem exatamente os códigos das tabelas, sem repetição", () => {
    const specCodeList = stageRowList.flatMap(([, rowList]) => rowList.map(([code]) => code));
    expect([...validationIssueCodeList].sort()).toEqual([...specCodeList].sort());
    expect(new Set(validationIssueCodeList).size).toBe(validationIssueCodeList.length);
  });

  it("todo código de revisão do §9 vira review_{c} ou review_kit_{c}", () => {
    for (const code of itemReviewCodeList) {
      expect(validationIssueCodeList).toContain(`review_${code}` as ValidationIssueCode);
    }
    for (const code of kitReviewCodeList) {
      expect(validationIssueCodeList).toContain(`review_kit_${code}` as ValidationIssueCode);
    }
  });

  it("todo código tem frase pt-BR do que corrigir", () => {
    for (const code of validationIssueCodeList) {
      expect(validationIssueDescriptionMap[code].length).toBeGreaterThan(10);
    }
  });

  it("createValidationIssue usa severidade e etapa do mapa e corta o trecho em 80", () => {
    const issue = createValidationIssue("figure_reference", {
      itemId: "p3",
      excerpt: "x".repeat(100),
    });
    expect(issue).toEqual({
      code: "figure_reference",
      severity: "blocker",
      stage: "validate",
      itemId: "p3",
      note: null,
      excerpt: "x".repeat(80),
    });
    expect(validationIssueSchema.safeParse(issue).success).toBe(true);
  });

  it("schema recusa severidade ou etapa diferentes do código e trecho longo", () => {
    const issue = createValidationIssue("unit_missing", { itemId: "m2" });
    expect(validationIssueSchema.safeParse({ ...issue, severity: "blocker" }).success).toBe(false);
    expect(validationIssueSchema.safeParse({ ...issue, stage: "review" }).success).toBe(false);
    expect(validationIssueSchema.safeParse({ ...issue, excerpt: "x".repeat(81) }).success).toBe(
      false,
    );
    expect(validationIssueSchema.safeParse({ ...issue, note: "x".repeat(201) }).success).toBe(
      false,
    );
    expect(validationIssueSchema.safeParse({ ...issue, itemId: "ma5-fractions" }).success).toBe(
      true,
    );
    expect(validationIssueSchema.safeParse({ ...issue, itemId: "q1" }).success).toBe(false);
  });

  it("o corte do trecho não deixa metade de um emoji", () => {
    const issue = createValidationIssue("markup_forbidden", { excerpt: `${"x".repeat(79)}🎉` });
    expect(issue.excerpt).toBe("x".repeat(79));
  });
});

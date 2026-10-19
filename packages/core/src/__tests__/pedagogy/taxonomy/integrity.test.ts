import { describe, expect, it } from "bun:test";
import { buildTopic } from "#src/__tests__/__fixtures__/entities.ts";
import {
  checkTaxonomyIntegrity,
  type TaxonomyIssueCode,
  taxonomyIssueCodeList,
} from "#src/pedagogy/taxonomy/integrity.ts";
import type { Topic } from "#src/pedagogy/taxonomy/schemas.ts";

const unitFractions = buildTopic({
  topicId: "ma4-unit-fractions",
  grade: "4",
  label: "Frações unitárias",
  bnccSkillList: ["EF04MA09"],
});
const equivalentFractions = buildTopic({ prerequisiteList: ["ma4-unit-fractions"] });
const accentuation = buildTopic({
  topicId: "lp5-accentuation",
  subject: "portuguese",
  label: "Acentuação",
  bnccSkillList: ["EF05LP03"],
  validationRuleList: ["single_normative_answer"],
});

const brokenTaxonomyByCode: Readonly<Record<TaxonomyIssueCode, readonly Topic[]>> = {
  duplicate_topic_id: [
    unitFractions,
    equivalentFractions,
    { ...equivalentFractions, label: "Outra" },
  ],
  duplicate_topic_label: [
    unitFractions,
    equivalentFractions,
    buildTopic({ topicId: "ma5-simplification", label: " frações EQUIVALENTES " }),
  ],
  topic_id_prefix_mismatch: [
    unitFractions,
    { ...equivalentFractions, grade: "6", bnccSkillList: ["EF06MA07"] },
  ],
  missing_prerequisite: [equivalentFractions],
  self_prerequisite: [buildTopic({ prerequisiteList: ["ma5-equivalent-fractions"] })],
  prerequisite_subject_mismatch: [
    accentuation,
    buildTopic({ prerequisiteList: ["lp5-accentuation"] }),
  ],
  prerequisite_from_later_grade: [
    { ...unitFractions, prerequisiteList: ["ma5-equivalent-fractions"] },
    buildTopic(),
  ],
  deprecated_prerequisite: [{ ...unitFractions, deprecated: true }, equivalentFractions],
  prerequisite_cycle: [
    buildTopic({ prerequisiteList: ["ma5-fractions"] }),
    buildTopic({
      topicId: "ma5-fractions",
      label: "Frações",
      prerequisiteList: ["ma5-equivalent-fractions"],
    }),
  ],
  bncc_skill_out_of_grade: [buildTopic({ bnccSkillList: ["EF06MA07"] })],
  validation_rule_subject_mismatch: [buildTopic({ validationRuleList: ["text_evidence"] })],
};

describe("checkTaxonomyIntegrity", () => {
  it("não aponta nada numa taxonomia íntegra, inclusive com pré-requisito de ano anterior", () => {
    expect(checkTaxonomyIntegrity([unitFractions, equivalentFractions, accentuation])).toEqual([]);
    expect(checkTaxonomyIntegrity([])).toEqual([]);
  });

  for (const code of taxonomyIssueCodeList) {
    it(`a fixture de ${code} dispara só ${code}`, () => {
      const issueList = checkTaxonomyIntegrity(brokenTaxonomyByCode[code]);
      expect(issueList.length).toBeGreaterThan(0);
      expect(issueList.every((issue) => issue.code === code)).toBe(true);
    });
  }

  it("aponta o assunto e o detalhe do problema", () => {
    expect(checkTaxonomyIntegrity(brokenTaxonomyByCode.missing_prerequisite)).toEqual([
      {
        code: "missing_prerequisite",
        topicId: "ma5-equivalent-fractions",
        detail: "ma4-unit-fractions",
      },
    ]);
    expect(checkTaxonomyIntegrity(brokenTaxonomyByCode.prerequisite_cycle)).toHaveLength(2);
  });

  it("assunto descontinuado pode depender de outro descontinuado", () => {
    const topicList = [
      { ...unitFractions, deprecated: true as const },
      { ...equivalentFractions, deprecated: true as const },
    ];
    expect(checkTaxonomyIntegrity(topicList)).toEqual([]);
  });
});

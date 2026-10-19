import { describe, expect, it } from "bun:test";
import { buildTopic } from "#src/__tests__/__fixtures__/entities.ts";
import { topicIdSchema } from "#src/order/schemas.ts";
import {
  topicSchema,
  topicValidationRuleDescriptionMap,
  topicValidationRuleList,
  topicValidationRuleSubjectMap,
} from "#src/pedagogy/taxonomy/schemas.ts";

describe("topicSchema (PRD §7.7)", () => {
  it("aceita um assunto completo, com ou sem deprecated: true", () => {
    expect(topicSchema.safeParse(buildTopic()).success).toBe(true);
    expect(topicSchema.safeParse(buildTopic({ deprecated: true })).success).toBe(true);
  });

  it("o id da taxonomia também é um topicId válido para o pedido", () => {
    expect(topicIdSchema.safeParse(buildTopic().topicId).success).toBe(true);
  });

  it("rejeita id fora do padrão, textos fora do limite, listas inválidas e campo extra", () => {
    const invalidList = [
      { topicId: "equivalent-fractions" },
      { topicId: "ma8-equivalent-fractions" },
      { topicId: "mt5-equivalent-fractions" },
      { topicId: "ma5-Equivalent_Fractions" },
      { label: "x".repeat(41) },
      { label: "  " },
      { description: "" },
      { description: "x".repeat(161) },
      { bnccSkillList: [] },
      { bnccSkillList: ["EF5MA04"] },
      { bnccSkillList: ["ef05ma04"] },
      { bnccSkillList: ["EF05MA04", "EF05MA04"] },
      { prerequisiteList: ["ma4-unit-fractions", "ma4-unit-fractions"] },
      { validationRuleList: ["rational_equivalence", "rational_equivalence"] },
      { validationRuleList: ["unknown_rule"] },
      { deprecated: false },
      { note: "campo extra" },
    ];
    for (const overrides of invalidList) {
      expect(topicSchema.safeParse({ ...buildTopic(), ...overrides }).success).toBe(false);
    }
  });
});

describe("regras aplicáveis por assunto", () => {
  it("toda regra tem descrição pt-BR e disciplina", () => {
    for (const rule of topicValidationRuleList) {
      expect(topicValidationRuleDescriptionMap[rule].length).toBeGreaterThan(20);
      expect(["math", "portuguese"]).toContain(topicValidationRuleSubjectMap[rule]);
    }
  });
});

import { describe, expect, it } from "bun:test";
import { buildTopic } from "#src/__tests__/__fixtures__/entities.ts";
import { createTaxonomyLookup } from "#src/pedagogy/taxonomy/lookup.ts";

const equivalentFractions = buildTopic();
const deprecatedTopic = buildTopic({
  topicId: "ma5-old-fractions",
  label: "Frações antigas",
  deprecated: true,
});
const decimals = buildTopic({ topicId: "ma5-decimal-numbers", label: "Números decimais" });
const otherGrade = buildTopic({ topicId: "ma6-fractions", grade: "6", label: "Frações" });
const otherSubject = buildTopic({
  topicId: "lp5-accentuation",
  subject: "portuguese",
  label: "Acentuação",
});

const lookup = createTaxonomyLookup([
  equivalentFractions,
  deprecatedTopic,
  decimals,
  otherGrade,
  otherSubject,
]);

describe("createTaxonomyLookup", () => {
  it("listTopics devolve só os ativos do ano e da disciplina, na ordem da lista", () => {
    expect(lookup.listTopics("5", "math").map((topic) => topic.topicId)).toEqual([
      "ma5-equivalent-fractions",
      "ma5-decimal-numbers",
    ]);
    expect(lookup.listTopics("7", "math")).toEqual([]);
  });

  it("findTopic devolve inclusive o descontinuado, porque kits antigos o citam", () => {
    expect(lookup.findTopic("ma5-old-fractions")).toEqual(deprecatedTopic);
    expect(lookup.findTopic("ma5-unknown")).toBeUndefined();
  });

  it("isSelectableTopic exige assunto ativo do mesmo ano e da mesma disciplina", () => {
    expect(lookup.isSelectableTopic("ma5-equivalent-fractions", "5", "math")).toBe(true);
    expect(lookup.isSelectableTopic("ma6-fractions", "5", "math")).toBe(false);
    expect(lookup.isSelectableTopic("lp5-accentuation", "5", "math")).toBe(false);
    expect(lookup.isSelectableTopic("ma5-old-fractions", "5", "math")).toBe(false);
    expect(lookup.isSelectableTopic("ma5-unknown", "5", "math")).toBe(false);
  });
});

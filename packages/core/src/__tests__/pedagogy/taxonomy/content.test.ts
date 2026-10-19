import { describe, expect, it } from "bun:test";
import { gradeList, subjectList } from "#src/enums.ts";
import { grade4MathTopicList } from "#src/pedagogy/taxonomy/4-math.ts";
import { grade4PortugueseTopicList } from "#src/pedagogy/taxonomy/4-portuguese.ts";
import { grade5MathTopicList } from "#src/pedagogy/taxonomy/5-math.ts";
import { grade5PortugueseTopicList } from "#src/pedagogy/taxonomy/5-portuguese.ts";
import { grade6MathTopicList } from "#src/pedagogy/taxonomy/6-math.ts";
import { grade6PortugueseTopicList } from "#src/pedagogy/taxonomy/6-portuguese.ts";
import { grade7MathTopicList } from "#src/pedagogy/taxonomy/7-math.ts";
import { grade7PortugueseTopicList } from "#src/pedagogy/taxonomy/7-portuguese.ts";
import {
  findTopic,
  isSelectableTopic,
  listTopics,
  taxonomyTopicList,
} from "#src/pedagogy/taxonomy/index.ts";
import { checkTaxonomyIntegrity } from "#src/pedagogy/taxonomy/integrity.ts";
import { type TopicValidationRule, topicSchema } from "#src/pedagogy/taxonomy/schemas.ts";
import { unsupportedTopicList } from "#src/pedagogy/taxonomy/unsupported.ts";

const MIN_TOPIC_COUNT_PER_SECTION = 15;
const MAX_TOPIC_COUNT_PER_SECTION = 30;

function slugSegmentPattern(subjectPrefix: "ma" | "lp", wordList: readonly string[]): RegExp {
  return new RegExp(`^${subjectPrefix}\\d-(?:.+-)?(?:${wordList.join("|")})(?:-|$)`);
}

const requiredRuleBySlugPatternList: readonly {
  readonly rule: TopicValidationRule;
  readonly pattern: RegExp;
}[] = [
  {
    rule: "rational_equivalence",
    pattern: slugSegmentPattern("ma", [
      "fractions?",
      "decimals?",
      "percentage",
      "probability",
      "rationals?",
      "ratio",
    ]),
  },
  {
    rule: "measurement_unit",
    pattern: slugSegmentPattern("ma", [
      "measurement",
      "perimeter",
      "area",
      "volume",
      "time",
      "temperature",
      "length",
      "money",
      "shopping",
      "proportion",
      "proportionality",
      "circle",
    ]),
  },
  {
    rule: "figure_free_statement",
    pattern: slugSegmentPattern("ma", [
      "perimeter",
      "area",
      "volume",
      "angles",
      "triangles",
      "polygons?",
      "quadrilaterals",
      "prisms",
      "solids",
      "circle",
      "cartesian",
      "coordinates",
      "location",
      "graphs",
      "statistics",
    ]),
  },
  {
    rule: "single_normative_answer",
    pattern: slugSegmentPattern("lp", [
      "spelling",
      "diphthongs",
      "syllables",
      "accentuation",
      "punctuation",
      "nouns",
      "adjectives?",
      "agreement",
      "suffixes",
      "verb",
      "pronouns",
      "formation",
      "sentences?",
      "predicate",
      "adverbs",
      "conjunctions",
    ]),
  },
  { rule: "linguistic_variety_respect", pattern: slugSegmentPattern("lp", ["variety"]) },
];

const portugueseGrammarPattern = requiredRuleBySlugPatternList.find(
  (entry) => entry.rule === "single_normative_answer",
)?.pattern;

describe("taxonomia v1 (RF-05)", () => {
  it("todo assunto passa no schema e a taxonomia é íntegra", () => {
    for (const topic of taxonomyTopicList) {
      expect({ topicId: topic.topicId, ok: topicSchema.safeParse(topic).success }).toEqual({
        topicId: topic.topicId,
        ok: true,
      });
    }
    expect(checkTaxonomyIntegrity(taxonomyTopicList)).toEqual([]);
  });

  for (const subject of subjectList) {
    for (const grade of gradeList) {
      it(`${grade}º ano de ${subject} tem de 15 a 30 assuntos ativos`, () => {
        const count = listTopics(grade, subject).length;
        expect(count).toBeGreaterThanOrEqual(MIN_TOPIC_COUNT_PER_SECTION);
        expect(count).toBeLessThanOrEqual(MAX_TOPIC_COUNT_PER_SECTION);
      });
    }
  }

  it("nenhum assunto ativo cobre área excluída da v1", () => {
    expect(unsupportedTopicList.length).toBeGreaterThan(0);
    const excludedSlugPattern =
      /symmetry-(reflection|translation|rotation)|enlarge|blueprint|flowchart|comic|cartoon|oral|podcast|video/;
    const offenderList = taxonomyTopicList.filter((topic) =>
      excludedSlugPattern.test(topic.topicId),
    );
    expect(offenderList.map((topic) => topic.topicId)).toEqual([]);
  });
});

describe("regras aplicáveis por assunto (RF-02)", () => {
  for (const { rule, pattern } of requiredRuleBySlugPatternList) {
    it(`todo assunto que casa ${pattern} tem ${rule}`, () => {
      const matchList = taxonomyTopicList.filter((topic) => pattern.test(topic.topicId));
      expect(matchList.length).toBeGreaterThan(0);
      const missingList = matchList.filter((topic) => !topic.validationRuleList.includes(rule));
      expect(missingList.map((topic) => topic.topicId)).toEqual([]);
    });
  }

  it("todo assunto de LP fora da gramática tem text_evidence", () => {
    const readingList = taxonomyTopicList.filter(
      (topic) => topic.subject === "portuguese" && !portugueseGrammarPattern?.test(topic.topicId),
    );
    expect(readingList.length).toBeGreaterThan(0);
    const missingList = readingList.filter(
      (topic) => !topic.validationRuleList.includes("text_evidence"),
    );
    expect(missingList.map((topic) => topic.topicId)).toEqual([]);
  });
});

describe("consulta sobre a taxonomia real (RF-06)", () => {
  it("lista cada seção na ordem do seu arquivo e acha por id", () => {
    const sectionList = [
      { grade: "4", subject: "math", topicList: grade4MathTopicList },
      { grade: "5", subject: "math", topicList: grade5MathTopicList },
      { grade: "6", subject: "math", topicList: grade6MathTopicList },
      { grade: "7", subject: "math", topicList: grade7MathTopicList },
      { grade: "4", subject: "portuguese", topicList: grade4PortugueseTopicList },
      { grade: "5", subject: "portuguese", topicList: grade5PortugueseTopicList },
      { grade: "6", subject: "portuguese", topicList: grade6PortugueseTopicList },
      { grade: "7", subject: "portuguese", topicList: grade7PortugueseTopicList },
    ] as const;
    for (const section of sectionList) {
      expect(listTopics(section.grade, section.subject).map((topic) => topic.topicId)).toEqual(
        section.topicList.map((topic) => topic.topicId),
      );
    }
    expect(findTopic("lp7-subject-predicate")?.label).toBe("Sujeito e predicado");
  });

  it("assunto de outro ano ou disciplina não é selecionável", () => {
    expect(isSelectableTopic("ma5-equivalent-fractions", "5", "math")).toBe(true);
    expect(isSelectableTopic("ma5-equivalent-fractions", "6", "math")).toBe(false);
    expect(isSelectableTopic("ma5-equivalent-fractions", "5", "portuguese")).toBe(false);
  });
});

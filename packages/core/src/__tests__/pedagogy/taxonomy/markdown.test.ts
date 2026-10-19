import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildTopic } from "#src/__tests__/__fixtures__/entities.ts";
import { TAXONOMY_VERSION, taxonomyTopicList } from "#src/pedagogy/taxonomy/index.ts";
import { renderTaxonomyMarkdown } from "#src/pedagogy/taxonomy/markdown.ts";
import { unsupportedTopicList } from "#src/pedagogy/taxonomy/unsupported.ts";

const taxonomyDocPath = join(import.meta.dir, "../../../../../../docs/pedagogy/taxonomia.md");

describe("documento da taxonomia (RF-08)", () => {
  it("docs/pedagogy/taxonomia.md está igual ao render do código (rode bun run taxonomy:doc)", () => {
    const rendered = renderTaxonomyMarkdown({
      topicList: taxonomyTopicList,
      taxonomyVersion: TAXONOMY_VERSION,
      unsupportedTopicList,
    });
    expect(readFileSync(taxonomyDocPath, "utf8")).toBe(rendered);
  });

  it("mostra pré-requisito de outro ano pelo nome, descontinuado e pipe escapado", () => {
    const unitFractions = buildTopic({
      topicId: "ma4-unit-fractions",
      grade: "4",
      label: "Frações unitárias",
      bnccSkillList: ["EF04MA09"],
    });
    const markdown = renderTaxonomyMarkdown({
      topicList: [
        unitFractions,
        buildTopic({ prerequisiteList: ["ma4-unit-fractions", "ma4-missing"] }),
        buildTopic({ topicId: "ma5-old", label: "Antigo | velho", deprecated: true }),
      ],
      taxonomyVersion: "tax-test",
      unsupportedTopicList: [
        {
          unsupportedTopicId: "ma-flowcharts",
          subject: "math",
          label: "Fluxogramas",
          description: "Caixas | setas",
          reason: "figure",
          recognitionCue: "Diagramas de caixas e setas.",
          keywordList: ["fluxograma", "fluxogramas"],
        },
      ],
    });
    expect(markdown).toContain("# Taxonomia de assuntos — tax-test");
    expect(markdown).toContain("Frações unitárias (4º ano); `ma4-missing`");
    expect(markdown).toContain("Antigo \\| velho (descontinuado)");
    expect(markdown).toContain("## Matemática — 5º ano (1 assunto)");
    expect(markdown).toContain(
      "| `ma-flowcharts` | Fluxogramas | Matemática | depende de figura ou imagem | Caixas \\| setas | Diagramas de caixas e setas. | fluxograma, fluxogramas |",
    );
    expect(markdown).not.toContain("Língua Portuguesa — ");
  });
});

import { describe, expect, it } from "bun:test";
import {
  gradeLabelMap,
  gradeList,
  listTopics,
  MAX_CONTEXT_THEME_COUNT,
  MAX_EVIDENCE_LENGTH,
  MAX_TERM_LENGTH,
  MAX_TERMINOLOGY_COUNT,
  MAX_TOPIC_CANDIDATE_COUNT,
  photoExtractionSchema,
  subjectLabelMap,
  subjectList,
  TAXONOMY_VERSION,
  unsupportedTopicList,
} from "@gizito/core";
import { z } from "zod";
import {
  buildExtractPrompt,
  EXTRACT_PROMPT_VERSION,
  extractSystemTemplate,
  extractUserTemplate,
} from "#src/pipeline/prompts/extract/v1.ts";

const promptDocUrl = new URL("../../../../../../docs/pedagogy/prompts-v1.md", import.meta.url);

async function readDocBlockList(): Promise<string[]> {
  const doc = await Bun.file(promptDocUrl).text();
  const section = doc.split("\n## extract v1\n")[1]?.split("\n## ")[0] ?? "";
  return [...section.matchAll(/```text\n([\s\S]*?)\n```/g)].map((match) => match[1] ?? "");
}

function blockLineIdList(systemPrompt: string, tag: string): string[] {
  const block = systemPrompt.split(`\n<${tag}`)[1]?.split(`</${tag}>`)[0] ?? "";
  return block
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).split(" | ")[0] ?? "");
}

const contextList = gradeList.flatMap((grade) =>
  subjectList.map((subject) => ({ grade, subject })),
);

describe("prompt extract v1 (spec F1-06, RF-01)", () => {
  it("tem a versão extract-v1", () => {
    expect(EXTRACT_PROMPT_VERSION).toBe("extract-v1");
  });

  it("transcreve o texto de prompts-v1.md sem mudança", async () => {
    expect(await readDocBlockList()).toEqual([extractSystemTemplate, extractUserTemplate]);
  });

  it.each(contextList)("não deixa placeholder no $grade × $subject", (context) => {
    const { systemPrompt, userText } = buildExtractPrompt(context);
    expect(systemPrompt).not.toContain("{{");
    expect(userText).not.toContain("{{");
  });

  it.each(contextList)(
    "oferece só os assuntos e os não atendidos do $grade × $subject",
    (context) => {
      const { systemPrompt } = buildExtractPrompt(context);
      expect(blockLineIdList(systemPrompt, "assuntos_da_taxonomia")).toEqual(
        listTopics(context.grade, context.subject).map((topic) => topic.topicId),
      );
      expect(blockLineIdList(systemPrompt, "assuntos_ainda_nao_atendidos")).toEqual(
        unsupportedTopicList
          .filter((topic) => topic.subject === context.subject)
          .map((topic) => topic.unsupportedTopicId),
      );
    },
  );

  it("escreve a linha do assunto e a do não atendido no formato da convenção", () => {
    const { systemPrompt } = buildExtractPrompt({ grade: "5", subject: "math" });
    const [topic] = listTopics("5", "math");
    const unsupported = unsupportedTopicList.find((item) => item.subject === "math");
    expect(systemPrompt).toContain(
      `- ${topic?.topicId} | ${topic?.label} | ${topic?.description}\n`,
    );
    expect(systemPrompt).toContain(
      `- ${unsupported?.unsupportedTopicId} | ${unsupported?.label} | como reconhecer: ${unsupported?.recognitionCue}`,
    );
    expect(systemPrompt).toContain(`<assuntos_da_taxonomia versao="${TAXONOMY_VERSION}">`);
  });

  it("interpola os limites do core e os rótulos do pedido", () => {
    const { systemPrompt, userText } = buildExtractPrompt({ grade: "6", subject: "portuguese" });
    expect(systemPrompt).toContain(`No máximo ${MAX_TOPIC_CANDIDATE_COUNT}.`);
    expect(systemPrompt).toContain(`até ${MAX_EVIDENCE_LENGTH} caracteres`);
    expect(systemPrompt).toContain(
      `até ${MAX_TERMINOLOGY_COUNT} termos técnicos da disciplina usados no material, com até ${MAX_TERM_LENGTH} caracteres`,
    );
    expect(systemPrompt).toContain(`até ${MAX_CONTEXT_THEME_COUNT} temas genéricos`);
    expect(systemPrompt).toContain(
      `aluno do ${gradeLabelMap["6"]} em ${subjectLabelMap.portuguese}`,
    );
    expect(userText).toBe(fillUser(gradeLabelMap["6"], subjectLabelMap.portuguese));
  });

  it("termina com o JSON Schema do photoExtractionSchema", () => {
    const { systemPrompt } = buildExtractPrompt({ grade: "4", subject: "math" });
    const schemaText = systemPrompt.split("sem texto antes ou depois:\n")[1] ?? "";
    expect(JSON.parse(schemaText)).toEqual(z.toJSONSchema(photoExtractionSchema));
  });

  it("monta o mesmo system para o mesmo ano e disciplina, para o cache de prompt", () => {
    expect(buildExtractPrompt({ grade: "7", subject: "math" }).systemPrompt).toBe(
      buildExtractPrompt({ grade: "7", subject: "math" }).systemPrompt,
    );
    expect(buildExtractPrompt({ grade: "7", subject: "math" }).systemPrompt).not.toBe(
      buildExtractPrompt({ grade: "6", subject: "math" }).systemPrompt,
    );
  });
});

function fillUser(gradeLabel: string, subjectLabel: string): string {
  return extractUserTemplate
    .replace("{{GRADE_LABEL}}", gradeLabel)
    .replace("{{SUBJECT_LABEL}}", subjectLabel);
}

import { describe, expect, it } from "bun:test";
import {
  buildMathFixture,
  buildPortugueseFixture,
  FIXTURE_MATERIAL_PROFILE,
} from "@gizito/core/testing";
import { mathExpressionFunctionNameList } from "@gizito/integrations";
import { buildGeneratePrompt as buildGeneratePromptV1 } from "#src/pipeline/prompts/generate/v1.ts";
import {
  buildGeneratePrompt,
  buildGenerateRepairPrompt,
  GENERATE_PROMPT_VERSION,
  generateSystemTemplateV2,
} from "#src/pipeline/prompts/generate/v2.ts";
import {
  buildReviewPrompt as buildReviewPromptV1,
  fullReviewScope,
} from "#src/pipeline/prompts/review/v1.ts";
import {
  buildReviewPrompt,
  REVIEW_PROMPT_VERSION,
  reviewSystemTemplateV2,
} from "#src/pipeline/prompts/review/v2.ts";

const promptDocUrl = new URL("../../../../../../docs/pedagogy/prompts-v2.md", import.meta.url);

async function readDocBlockList(stage: string): Promise<string[]> {
  const doc = await Bun.file(promptDocUrl).text();
  const section = doc.split(`\n## ${stage} v2\n`)[1]?.split("\n## ")[0] ?? "";
  return [...section.matchAll(/```text\n([\s\S]*?)\n```/g)].map((match) => match[1] ?? "");
}

const math = buildMathFixture();
const portuguese = buildPortugueseFixture();

function kitInputOf(fixture: typeof math | typeof portuguese) {
  return {
    grade: fixture.studyKit.grade,
    subject: fixture.studyKit.subject,
    kitSlotPlan: fixture.kitSlotPlan,
    plan: fixture.plan,
    materialProfile: FIXTURE_MATERIAL_PROFILE,
  };
}

describe("prompts generate e review v2 (spec F1-10, correções da rodada 1)", () => {
  it("têm as versões generate-v2 e review-v2", () => {
    expect([GENERATE_PROMPT_VERSION, REVIEW_PROMPT_VERSION]).toEqual(["generate-v2", "review-v2"]);
  });

  it("transcrevem o system de prompts-v2.md sem mudança", async () => {
    expect(await readDocBlockList("generate")).toEqual([generateSystemTemplateV2]);
    expect(await readDocBlockList("review")).toEqual([reviewSystemTemplateV2]);
  });

  it("o generate de Matemática lista as funções do avaliador, com min e max, sem placeholder sobrando", () => {
    const prompt = buildGeneratePrompt(kitInputOf(math));
    expect(mathExpressionFunctionNameList).toContain("min");
    expect(mathExpressionFunctionNameList).toContain("max");
    expect(prompt.systemPrompt).toContain(
      `Funções no cálculo, só destas: ${mathExpressionFunctionNameList.join(", ")}`,
    );
    expect(prompt.systemPrompt).not.toContain("{{");
    expect(buildGeneratePrompt(kitInputOf(portuguese)).systemPrompt).not.toContain(
      "Funções no cálculo",
    );
  });

  it("o generate v2 pede primeiro nome, sem nome de escola, e conferência de outra resposta certa", () => {
    const { systemPrompt } = buildGeneratePrompt(kitInputOf(portuguese));
    expect(systemPrompt).toContain("personagens só com o primeiro nome");
    expect(systemPrompt).toContain("nunca o nome de uma escola, empresa ou instituição");
    expect(systemPrompt).toContain("procure outra resposta que também esteja certa");
    expect(systemPrompt).toContain("Explicação e passos coerentes do começo ao fim");
  });

  it("a mensagem do usuário do generate e do review é a mesma do v1", () => {
    expect(buildGeneratePrompt(kitInputOf(math)).userText).toBe(
      buildGeneratePromptV1(kitInputOf(math)).userText,
    );
    const reviewInput = {
      ...kitInputOf(portuguese),
      studyKit: portuguese.studyKit,
      scope: fullReviewScope(portuguese.studyKit),
    };
    expect(buildReviewPrompt(reviewInput).userText).toBe(buildReviewPromptV1(reviewInput).userText);
    expect(buildReviewPrompt(reviewInput).systemPrompt).toContain(
      "Primeiro nome de personagem fictício não é dado pessoal.",
    );
    expect(buildReviewPrompt(reviewInput).systemPrompt).not.toContain("{{");
  });

  it("o reparo do v2 usa o system v2 e o bloco de itens do v1", () => {
    const prompt = buildGenerateRepairPrompt({
      ...kitInputOf(math),
      studyKit: math.studyKit,
      itemIdList: ["p2"],
      issueList: [
        {
          code: "math_expression_invalid",
          severity: "blocker",
          stage: "validate",
          itemId: "p2",
          note: null,
          excerpt: "min(3, 4)",
        },
      ],
    });
    expect(prompt.systemPrompt).toContain("Funções no cálculo, só destas:");
    expect(prompt.userText).toContain("<itens_para_refazer>\n- p2: math_expression_invalid");
  });
});

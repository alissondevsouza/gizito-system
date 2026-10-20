import { describe, expect, it } from "bun:test";
import { fillPromptTemplate, PromptTemplateError } from "#src/pipeline/prompts/template.ts";

describe("fillPromptTemplate", () => {
  it("troca cada placeholder pelo valor", () => {
    expect(fillPromptTemplate("{{A}} e {{B_2}}, de novo {{A}}", { A: "um", B_2: "dois" })).toBe(
      "um e dois, de novo um",
    );
  });

  it("placeholder sem valor é erro", () => {
    expect(() => fillPromptTemplate("ano {{GRADE_LABEL}}", {})).toThrow(PromptTemplateError);
  });

  it("não expande placeholder que vem dentro de um valor", () => {
    expect(fillPromptTemplate("{{A}}", { A: "{{B}}", B: "x" })).toBe("{{B}}");
  });
});

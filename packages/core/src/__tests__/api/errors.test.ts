import { describe, expect, it } from "bun:test";
import { apiErrorCodeList, apiErrorSchema } from "#src/api/errors.ts";
import { outcomeCodeSchema } from "#src/common.ts";

describe("erros da api (api.md §1)", () => {
  it("códigos estáveis em minúsculas e _", () => {
    for (const code of apiErrorCodeList) {
      expect(outcomeCodeSchema.safeParse(code).success).toBe(true);
    }
    expect(apiErrorCodeList).toContain("not_found");
    expect(apiErrorCodeList).toContain("internal_error");
  });

  it("aceita { error, code } e recusa código desconhecido ou mensagem vazia", () => {
    expect(apiErrorSchema.safeParse({ error: "Não encontrado.", code: "not_found" }).success).toBe(
      true,
    );
    expect(apiErrorSchema.safeParse({ error: "x", code: "teapot" }).success).toBe(false);
    expect(apiErrorSchema.safeParse({ error: "", code: "not_found" }).success).toBe(false);
  });
});

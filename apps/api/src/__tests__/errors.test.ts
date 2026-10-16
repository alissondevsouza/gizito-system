import { describe, expect, it } from "bun:test";
import { apiErrorSchema } from "@gizito/core";
import { toApiErrorResponse } from "#src/errors.ts";

describe("toApiErrorResponse", () => {
  it("rota desconhecida vira 404 not_found", () => {
    expect(toApiErrorResponse("NOT_FOUND", new Error())).toMatchObject({
      status: 404,
      body: { code: "not_found" },
    });
  });

  it("corpo malformado e entrada inválida viram 400 validation_error", () => {
    for (const [code, error] of [
      ["PARSE", new Error()],
      ["VALIDATION", { type: "body" }],
      ["VALIDATION", { type: "query" }],
    ] as const) {
      expect(toApiErrorResponse(code, error)).toMatchObject({
        status: 400,
        body: { code: "validation_error" },
      });
    }
  });

  it("resposta fora do schema e erro desconhecido viram 500 internal_error", () => {
    for (const [code, error] of [
      ["VALIDATION", { type: "response" }],
      ["UNKNOWN", new Error("boom")],
      ["INTERNAL_SERVER_ERROR", "x"],
    ] as const) {
      expect(toApiErrorResponse(code, error)).toMatchObject({
        status: 500,
        body: { code: "internal_error" },
      });
    }
  });

  it("todo corpo segue o contrato { error, code } do core", () => {
    for (const code of ["NOT_FOUND", "PARSE", "UNKNOWN"]) {
      expect(apiErrorSchema.safeParse(toApiErrorResponse(code, null).body).success).toBe(true);
    }
  });
});

import { describe, expect, it } from "bun:test";
import { apiErrorSchema } from "@gizito/core";
import { status } from "elysia";
import { toApiErrorResponse } from "#src/errors.ts";

describe("toApiErrorResponse", () => {
  it("rota desconhecida vira 404 not_found", () => {
    expect(toApiErrorResponse("NOT_FOUND", new Error())).toMatchObject({
      status: 404,
      body: { code: "not_found" },
    });
  });

  it("status lançado por handler ou service mantém o status e o corpo do contrato", () => {
    const orderNotFound = { error: "Pedido não encontrado.", code: "order_not_found" } as const;
    expect(toApiErrorResponse(404, status(404, orderNotFound))).toEqual({
      status: 404,
      body: orderNotFound,
    });
  });

  it("status lançado com corpo fora do contrato ou sem ser erro vira 500 internal_error", () => {
    for (const thrown of [
      status(404, { message: "x" }),
      status(404),
      status(200, { error: "x", code: "not_found" }),
    ]) {
      expect(toApiErrorResponse(404, thrown)).toMatchObject({
        status: 500,
        body: { code: "internal_error" },
      });
    }
  });

  it("corpo malformado, arquivo de tipo inválido e entrada inválida viram 400 validation_error", () => {
    for (const [code, error] of [
      ["PARSE", new Error()],
      ["INVALID_FILE_TYPE", new Error()],
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

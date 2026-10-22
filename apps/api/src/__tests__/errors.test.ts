import { describe, expect, it } from "bun:test";
import { apiErrorSchema } from "@gizito/core";
import { status } from "elysia";
import {
  orderErrorStatusMap,
  payloadTooLargeError,
  toApiErrorResponse,
  toOrderErrorResponse,
} from "#src/errors.ts";

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

describe("erros de pedido (spec F2-01, tabela de erros)", () => {
  it("cada código tem status e corpo no contrato", () => {
    for (const code of Object.keys(orderErrorStatusMap) as (keyof typeof orderErrorStatusMap)[]) {
      const response = toOrderErrorResponse({ code });
      expect(apiErrorSchema.parse(response.body).code).toBe(code);
      expect(response.status).toBe(orderErrorStatusMap[code]);
    }
    expect(orderErrorStatusMap).toEqual({
      too_many_photos: 400,
      photo_too_large: 413,
      photo_invalid: 422,
      photo_duplicate: 422,
      challenge_required: 429,
      order_not_found: 404,
      not_found: 404,
      invalid_state: 409,
      service_unavailable: 503,
    });
  });

  it("erro de foto cita a posição para a pessoa e leva photoIndex 0-based", () => {
    const response = toOrderErrorResponse({ code: "photo_too_large", photoIndex: 1 });
    expect(response.body).toEqual({
      error: "A foto 2 está acima de 8 MB. Escolha uma imagem menor.",
      code: "photo_too_large",
      photoIndex: 1,
    });
    expect(toOrderErrorResponse({ code: "photo_invalid" }).body).not.toHaveProperty("photoIndex");
  });

  it("corpo grande demais tem contrato próprio", () => {
    expect(apiErrorSchema.parse(payloadTooLargeError).code).toBe("payload_too_large");
  });
});

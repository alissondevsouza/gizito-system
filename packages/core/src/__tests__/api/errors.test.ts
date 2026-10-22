import { describe, expect, it } from "bun:test";
import { apiErrorCodeList, apiErrorSchema } from "#src/api/errors.ts";
import { outcomeCodeSchema } from "#src/common.ts";
import { MAX_PHOTO_COUNT } from "#src/constants.ts";

describe("erros da api (api.md §1)", () => {
  it("códigos estáveis em minúsculas e _", () => {
    for (const code of apiErrorCodeList) {
      expect(outcomeCodeSchema.safeParse(code).success).toBe(true);
    }
    expect(apiErrorCodeList).toContain("not_found");
    expect(apiErrorCodeList).toContain("internal_error");
    expect(apiErrorCodeList).toContain("unsupported_topic");
  });

  it("aceita { error, code } e recusa código desconhecido ou mensagem vazia", () => {
    expect(apiErrorSchema.safeParse({ error: "Não encontrado.", code: "not_found" }).success).toBe(
      true,
    );
    expect(apiErrorSchema.safeParse({ error: "x", code: "teapot" }).success).toBe(false);
    expect(apiErrorSchema.safeParse({ error: "", code: "not_found" }).success).toBe(false);
  });

  it("erro de foto leva photoIndex opcional, 0-based e dentro do limite de fotos", () => {
    expect(apiErrorCodeList).toContain("photo_duplicate");
    expect(apiErrorCodeList).toContain("payload_too_large");
    expect(apiErrorCodeList).toContain("challenge_required");
    expect(apiErrorCodeList).toContain("service_unavailable");
    const photoError = { error: "A foto 2 é igual a outra.", code: "photo_duplicate" };
    expect(apiErrorSchema.safeParse({ ...photoError, photoIndex: 1 }).success).toBe(true);
    expect(apiErrorSchema.safeParse(photoError).success).toBe(true);
    expect(apiErrorSchema.safeParse({ ...photoError, photoIndex: MAX_PHOTO_COUNT }).success).toBe(
      false,
    );
  });

  it("422 de assunto não atendido leva a lista com rótulo e motivo", () => {
    const body = {
      error: "Ainda não consigo preparar Simetria desenhada em malha.",
      code: "unsupported_topic",
      unsupportedTopicList: [
        {
          unsupportedTopicId: "ma-grid-symmetry",
          label: "Simetria desenhada em malha",
          reason: "figure",
        },
      ],
    };
    expect(apiErrorSchema.safeParse(body).success).toBe(true);
    expect(apiErrorSchema.safeParse({ ...body, unsupportedTopicList: [] }).success).toBe(false);
  });
});

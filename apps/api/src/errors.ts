import type { ApiError } from "@gizito/core";

export const notFoundError: ApiError = {
  error: "Não encontramos o que você procurou.",
  code: "not_found",
};

export const validationError: ApiError = {
  error: "Confira os dados enviados e tente de novo.",
  code: "validation_error",
};

export const internalError: ApiError = {
  error: "Algo deu errado do nosso lado. Tente de novo em instantes.",
  code: "internal_error",
};

export type ApiErrorResponse = {
  status: number;
  body: ApiError;
};

export function toApiErrorResponse(elysiaCode: string | number, error: unknown): ApiErrorResponse {
  if (elysiaCode === "NOT_FOUND") return { status: 404, body: notFoundError };
  if (elysiaCode === "PARSE") return { status: 400, body: validationError };
  if (elysiaCode === "VALIDATION" && !isResponseValidationError(error)) {
    return { status: 400, body: validationError };
  }
  return { status: 500, body: internalError };
}

function isResponseValidationError(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "type" in error && error.type === "response"
  );
}

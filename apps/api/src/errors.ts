import { type ApiError, apiErrorSchema } from "@gizito/core";
import { ElysiaCustomStatusResponse } from "elysia";

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

const internalErrorResponse: ApiErrorResponse = { status: 500, body: internalError };
const validationErrorResponse: ApiErrorResponse = { status: 400, body: validationError };

export function toApiErrorResponse(elysiaCode: string | number, error: unknown): ApiErrorResponse {
  if (error instanceof ElysiaCustomStatusResponse) return fromThrownStatus(error);
  if (elysiaCode === "NOT_FOUND") return { status: 404, body: notFoundError };
  if (elysiaCode === "PARSE" || elysiaCode === "INVALID_FILE_TYPE") return validationErrorResponse;
  if (elysiaCode === "VALIDATION" && !isResponseValidationError(error)) {
    return validationErrorResponse;
  }
  return internalErrorResponse;
}

function fromThrownStatus(thrown: ElysiaCustomStatusResponse<number>): ApiErrorResponse {
  const body = apiErrorSchema.safeParse(thrown.response);
  if (!body.success || typeof thrown.code !== "number" || thrown.code < 400) {
    return internalErrorResponse;
  }
  return { status: thrown.code, body: body.data };
}

function isResponseValidationError(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "type" in error && error.type === "response"
  );
}

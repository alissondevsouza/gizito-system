import {
  type ApiError,
  apiErrorSchema,
  MAX_PHOTO_BYTES,
  MAX_PHOTO_COUNT,
  type PhotoIndex,
  type UnsupportedTopicReason,
  type UnsupportedTopicView,
} from "@gizito/core";
import { ElysiaCustomStatusResponse } from "elysia";
import type { ChargeServiceError, ChargeServiceErrorCode } from "#src/services/charges.ts";
import type { OrderServiceError, OrderServiceErrorCode } from "#src/services/orders.ts";

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

const MEGABYTE = 1024 * 1024;

export const payloadTooLargeError: ApiError = {
  error: `O envio passou do limite de ${MAX_PHOTO_COUNT} fotos de até ${MAX_PHOTO_BYTES / MEGABYTE} MB.`,
  code: "payload_too_large",
};

const photoPosition = (photoIndex: PhotoIndex | undefined) =>
  photoIndex === undefined ? "Uma foto" : `A foto ${photoIndex + 1}`;

const orderErrorMessageMap: Readonly<
  Record<OrderServiceErrorCode, (photoIndex: PhotoIndex | undefined) => string>
> = {
  too_many_photos: () => `Envie no máximo ${MAX_PHOTO_COUNT} fotos.`,
  photo_too_large: (photoIndex) =>
    `${photoPosition(photoIndex)} está acima de ${MAX_PHOTO_BYTES / MEGABYTE} MB. Escolha uma imagem menor.`,
  photo_invalid: (photoIndex) =>
    `Não consegui abrir ${photoPosition(photoIndex).toLowerCase()}. Envie uma foto em JPG ou PNG.`,
  photo_duplicate: (photoIndex) =>
    `${photoPosition(photoIndex)} é igual a outra deste pedido. Escolha uma foto diferente.`,
  challenge_required: () => "Você já enviou muitas fotos por agora. Tente de novo mais tarde.",
  order_not_found: () => "Pedido não encontrado.",
  not_found: () => "Não encontramos esta foto no pedido.",
  invalid_state: () => "Não dá para trocar as fotos deste pedido agora.",
  service_unavailable: () => "Não conseguimos guardar as fotos agora. Tente de novo em instantes.",
};

export const orderErrorStatusMap: Readonly<Record<OrderServiceErrorCode, number>> = {
  too_many_photos: 400,
  photo_too_large: 413,
  photo_invalid: 422,
  photo_duplicate: 422,
  challenge_required: 429,
  order_not_found: 404,
  not_found: 404,
  invalid_state: 409,
  service_unavailable: 503,
};

export function toOrderErrorResponse({ code, photoIndex }: OrderServiceError): ApiErrorResponse {
  const body: ApiError = { error: orderErrorMessageMap[code](photoIndex), code };
  return {
    status: orderErrorStatusMap[code],
    body: photoIndex === undefined ? body : { ...body, photoIndex },
  };
}

const unsupportedTopicReasonTextMap: Readonly<Record<UnsupportedTopicReason, string>> = {
  figure: "depende de imagem ou de fala",
  orality: "depende de imagem ou de fala",
  open_writing: "é produção de texto que precisa de correção",
};

export function unsupportedTopicMessage(unsupportedTopicList: readonly UnsupportedTopicView[]) {
  const [first] = unsupportedTopicList;
  if (first === undefined) return "Ainda não consigo preparar esse assunto.";
  return `Ainda não consigo preparar ${first.label}, porque ${unsupportedTopicReasonTextMap[first.reason]}.`;
}

const chargeErrorMessageMap: Readonly<
  Record<Exclude<ChargeServiceErrorCode, "unsupported_topic">, string>
> = {
  order_not_found: "Pedido não encontrado.",
  invalid_state: "Este pedido não está mais nesta etapa. Atualize a página para continuar.",
  validation_error: "Confira os assuntos escolhidos e tente de novo.",
  charge_active: "O Pix deste pedido ainda está valendo.",
  service_unavailable: "Não conseguimos gerar o Pix agora. Tente de novo em instantes.",
};

export const chargeErrorStatusMap: Readonly<Record<ChargeServiceErrorCode, number>> = {
  order_not_found: 404,
  invalid_state: 409,
  validation_error: 400,
  unsupported_topic: 422,
  charge_active: 409,
  service_unavailable: 503,
};

export function toChargeErrorResponse(error: ChargeServiceError): ApiErrorResponse {
  const status = chargeErrorStatusMap[error.code];
  if (error.code === "unsupported_topic") {
    return {
      status,
      body: {
        error: unsupportedTopicMessage(error.unsupportedTopicList),
        code: error.code,
        unsupportedTopicList: [...error.unsupportedTopicList],
      },
    };
  }
  return { status, body: { error: chargeErrorMessageMap[error.code], code: error.code } };
}

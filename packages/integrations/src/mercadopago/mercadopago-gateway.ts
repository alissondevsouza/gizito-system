import {
  type ChargeReference,
  type CreatedCharge,
  createChargeInputSchema,
  err,
  httpsUrlSchema,
  ok,
  type ParsedWebhook,
  type PaymentGateway,
  PaymentGatewayError,
  type PaymentGatewayErrorCode,
  type Result,
  type WebhookRequest,
} from "@gizito/core";
import type { z } from "zod";
import { parseDecimalAsCents } from "#src/mercadopago/amount.ts";
import {
  buildCreateOrderBody,
  createdOrderResponseSchema,
  errorResponseSchema,
  orderStatusResponseSchema,
  refundResponseSchema,
  resolveChargeStatus,
  webhookBodySchema,
} from "#src/mercadopago/schemas.ts";
import {
  buildSignatureManifest,
  computeWebhookSignature,
  isSameSignature,
  parseSignatureHeader,
} from "#src/mercadopago/webhook-signature.ts";

export const MERCADOPAGO_API_BASE_URL = "https://api.mercadopago.com";
export const DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS = 10_000;
export const DEFAULT_GATEWAY_RETRY_DELAY_MS = 500;
export const MERCADOPAGO_ORDER_WEBHOOK_TYPE = "order";

const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR = 500;

export type MercadoPagoGatewayOptions = {
  readonly accessToken: string;
  readonly webhookSecret: string;
  readonly fetch?: typeof fetch;
  readonly baseUrl?: string;
  readonly requestTimeoutMs?: number;
  readonly retryDelayMs?: number;
};

type GatewayRequest = {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly idempotencyKey?: string;
  readonly body?: Record<string, unknown>;
};

export type GatewayFailureCause = {
  readonly status: number | null;
  readonly providerCode: string | null;
};

type GatewayFailure = {
  readonly error: PaymentGatewayError;
  readonly isRetryable: boolean;
};

function gatewayError(
  code: PaymentGatewayErrorCode,
  cause: GatewayFailureCause = { status: null, providerCode: null },
): PaymentGatewayError {
  return new PaymentGatewayError(code, { cause });
}

function readHeader(headerMap: Readonly<Record<string, string>>, name: string): string | null {
  const entry = Object.entries(headerMap).find(([key]) => key.toLowerCase() === name);
  return entry === undefined || entry[1] === "" ? null : entry[1];
}

async function readProviderCode(response: Response): Promise<string | null> {
  try {
    const parsed = errorResponseSchema.safeParse(await response.json());
    return parsed.success ? (parsed.data.errors[0]?.code ?? null) : null;
  } catch {
    return null;
  }
}

function orderPath(gatewayOrderId: string): string {
  return `/v1/orders/${encodeURIComponent(gatewayOrderId)}`;
}

export function createMercadoPagoGateway({
  accessToken,
  webhookSecret,
  fetch: fetchImpl = fetch,
  baseUrl = MERCADOPAGO_API_BASE_URL,
  requestTimeoutMs = DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS,
  retryDelayMs = DEFAULT_GATEWAY_RETRY_DELAY_MS,
}: MercadoPagoGatewayOptions): PaymentGateway {
  async function sendOnce<T>(
    request: GatewayRequest,
    schema: z.ZodType<T>,
  ): Promise<Result<T, GatewayFailure>> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}${request.path}`, {
        method: request.method,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          ...(request.idempotencyKey === undefined
            ? {}
            : { "x-idempotency-key": request.idempotencyKey }),
        },
        ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
    } catch {
      return err({ error: gatewayError("gateway_unavailable"), isRetryable: true });
    }
    if (!response.ok) {
      const cause = { status: response.status, providerCode: await readProviderCode(response) };
      const isServerError = response.status >= HTTP_SERVER_ERROR;
      const isUnavailable = isServerError || response.status === HTTP_TOO_MANY_REQUESTS;
      return err({
        error: gatewayError(isUnavailable ? "gateway_unavailable" : "gateway_rejected", cause),
        isRetryable: isServerError,
      });
    }
    const invalid = err({
      error: gatewayError("gateway_response_invalid", {
        status: response.status,
        providerCode: null,
      }),
      isRetryable: false,
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return invalid;
    }
    const parsed = schema.safeParse(body);
    return parsed.success ? ok(parsed.data) : invalid;
  }

  async function send<T>(request: GatewayRequest, schema: z.ZodType<T>): Promise<T> {
    const first = await sendOnce(request, schema);
    if (first.ok) return first.value;
    if (!first.error.isRetryable) throw first.error.error;
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    const second = await sendOnce(request, schema);
    if (second.ok) return second.value;
    throw second.error.error;
  }

  return {
    name: "mercadopago",
    async createCharge(rawInput): Promise<CreatedCharge> {
      const input = createChargeInputSchema.parse(rawInput);
      const created = await send(
        {
          method: "POST",
          path: "/v1/orders",
          idempotencyKey: input.chargeId,
          body: buildCreateOrderBody(input),
        },
        createdOrderResponseSchema,
      );
      const [payment] = created.transactions.payments;
      if (payment === undefined) throw gatewayError("gateway_response_invalid");
      const ticketUrl = httpsUrlSchema.safeParse(payment.payment_method.ticket_url);
      return {
        gatewayOrderId: created.id,
        gatewayPaymentId: payment.id,
        qrCode: payment.payment_method.qr_code,
        qrCodeBase64: payment.payment_method.qr_code_base64 || null,
        ticketUrl: ticketUrl.success ? ticketUrl.data : null,
        expireDatetime: input.expireDatetime,
      };
    },
    async getChargeStatus(reference: ChargeReference) {
      const order = await send(
        { method: "GET", path: orderPath(reference.gatewayOrderId) },
        orderStatusResponseSchema,
      );
      const status = resolveChargeStatus(order.status, order.status_detail ?? null);
      const amountCents = parseDecimalAsCents(order.total_amount);
      if (status === null || amountCents === null || amountCents <= 0) {
        throw gatewayError("gateway_response_invalid");
      }
      const lastUpdated = order.last_updated_date ? new Date(order.last_updated_date) : null;
      return {
        status,
        gatewayPaymentId: order.transactions?.payments?.[0]?.id ?? null,
        amountCents,
        externalReference: order.external_reference || null,
        paidDatetime: status === "paid" ? lastUpdated : null,
      };
    },
    async refund(reference: ChargeReference) {
      const refunded = await send(
        {
          method: "POST",
          path: `${orderPath(reference.gatewayOrderId)}/refund`,
          idempotencyKey: `refund-${reference.chargeId}`,
        },
        refundResponseSchema,
      );
      const lastRefund = refunded.transactions.refunds.at(-1);
      if (lastRefund === undefined) throw gatewayError("gateway_response_invalid");
      return { refundId: lastRefund.id };
    },
    async parseWebhook({ headerMap, queryMap, rawBody }: WebhookRequest): Promise<ParsedWebhook> {
      if (queryMap.type !== MERCADOPAGO_ORDER_WEBHOOK_TYPE) {
        return { valid: false, reason: "unsupported_event" };
      }
      const dataId = queryMap["data.id"];
      if (dataId === undefined || dataId === "") return { valid: false, reason: "malformed" };
      const signatureHeader = readHeader(headerMap, "x-signature");
      const signature = signatureHeader === null ? null : parseSignatureHeader(signatureHeader);
      if (signature === null || signature.v1 === null) {
        return { valid: false, reason: "invalid_signature" };
      }
      const manifest = buildSignatureManifest({
        dataId,
        requestId: readHeader(headerMap, "x-request-id"),
        ts: signature.ts,
      });
      if (!isSameSignature(computeWebhookSignature(webhookSecret, manifest), signature.v1)) {
        return { valid: false, reason: "invalid_signature" };
      }
      let body: unknown;
      try {
        body = JSON.parse(rawBody);
      } catch {
        return { valid: false, reason: "malformed" };
      }
      const parsedBody = webhookBodySchema.safeParse(body);
      if (!parsedBody.success) return { valid: false, reason: "malformed" };
      return {
        valid: true,
        externalId: `${dataId}:${parsedBody.data.action}`,
        gatewayOrderId: dataId,
        gatewayPaymentId: null,
      };
    },
  };
}

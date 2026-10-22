import { MAX_WEBHOOK_BODY_BYTES, type WebhookRequest, webhookAckSchema } from "@gizito/core";
import { Elysia, status } from "elysia";
import {
  rateLimitedError,
  toWebhookErrorResponse,
  webhookPayloadTooLargeError,
} from "#src/errors.ts";
import { resolveClientIp } from "#src/http/client-identity.ts";
import type { WebhookRateLimiter } from "#src/http/webhook-rate-limit.ts";
import {
  type ChargeWebhookDependencies,
  receiveMercadoPagoWebhook,
} from "#src/services/charge-webhooks.ts";

export type MercadoPagoWebhookRouteDependencies = ChargeWebhookDependencies & {
  readonly trustedProxyHopCount: number;
  readonly webhookRateLimiter: WebhookRateLimiter;
};

const NO_STORE = "no-store";

function declaresBodyAbove(request: Request, maxBytes: number): boolean {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  return Number.isFinite(contentLength) && contentLength > maxBytes;
}

function buildWebhookRequest(request: Request, rawBody: string): WebhookRequest {
  return {
    headerMap: Object.fromEntries(request.headers.entries()),
    queryMap: Object.fromEntries(new URL(request.url).searchParams.entries()),
    rawBody,
  };
}

export function createMercadoPagoWebhookRoutes(dependencies: MercadoPagoWebhookRouteDependencies) {
  const { trustedProxyHopCount, webhookRateLimiter } = dependencies;
  return new Elysia().post(
    "/webhooks/mercadopago",
    async ({ request, server, set }) => {
      set.headers["cache-control"] = NO_STORE;
      const clientIp = resolveClientIp(
        request.headers,
        server?.requestIP(request)?.address ?? null,
        trustedProxyHopCount,
      );
      if (!webhookRateLimiter.take(clientIp)) throw status(429, rateLimitedError);
      if (declaresBodyAbove(request, MAX_WEBHOOK_BODY_BYTES)) {
        throw status(413, webhookPayloadTooLargeError);
      }
      const rawBody = await request.text();
      if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BODY_BYTES) {
        throw status(413, webhookPayloadTooLargeError);
      }
      const result = await receiveMercadoPagoWebhook(
        dependencies,
        buildWebhookRequest(request, rawBody),
      );
      if (!result.ok) {
        const response = toWebhookErrorResponse(result.error);
        throw status(response.status, response.body);
      }
      return result.value;
    },
    { parse: "none", response: { 200: webhookAckSchema } },
  );
}

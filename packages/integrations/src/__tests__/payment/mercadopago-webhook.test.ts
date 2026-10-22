import { describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import { MAX_WEBHOOK_ACTION_LENGTH, type WebhookRequest } from "@gizito/core";
import {
  GATEWAY_ORDER_ID,
  orderWebhookBody,
  WEBHOOK_REQUEST_ID,
  WEBHOOK_TS,
} from "#src/__tests__/payment/__fixtures__/mercadopago.ts";
import { createMercadoPagoGateway } from "#src/mercadopago/mercadopago-gateway.ts";
import {
  buildSignatureManifest,
  parseSignatureHeader,
} from "#src/mercadopago/webhook-signature.ts";

const WEBHOOK_SECRET = "segredo-de-teste-do-webhook";

const gateway = createMercadoPagoGateway({
  accessToken: "APP_USR-token-de-teste",
  webhookSecret: WEBHOOK_SECRET,
  fetch: (async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    throw new Error("parseWebhook não faz IO");
  }) as typeof fetch,
});

function sign(manifest: string, secret = WEBHOOK_SECRET): string {
  return createHmac("sha256", secret).update(manifest).digest("hex");
}

function signedRequest({
  dataId = GATEWAY_ORDER_ID,
  requestId = WEBHOOK_REQUEST_ID as string | null,
  ts = WEBHOOK_TS,
  action = "order.processed",
  signature,
}: {
  dataId?: string;
  requestId?: string | null;
  ts?: string;
  action?: string;
  signature?: string;
} = {}): WebhookRequest {
  const manifest =
    requestId === null
      ? `id:${dataId.toLowerCase()};ts:${ts};`
      : `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  return {
    headerMap: {
      "X-Signature": `ts=${ts},v1=${signature ?? sign(manifest)}`,
      ...(requestId === null ? {} : { "X-Request-Id": requestId }),
      "content-type": "application/json",
    },
    queryMap: { "data.id": dataId, type: "order" },
    rawBody: JSON.stringify(orderWebhookBody(action)),
  };
}

describe("assinatura do webhook do Mercado Pago (spec F2-03, RF-06)", () => {
  it("separa ts e v1 com espaços e partes extras", () => {
    expect(parseSignatureHeader(" ts=123 , v1=abc,v2=zzz")).toEqual({ ts: "123", v1: "abc" });
    expect(parseSignatureHeader("v1=abc")).toEqual({ ts: null, v1: "abc" });
    expect(parseSignatureHeader("lixo")).toEqual({ ts: null, v1: null });
  });

  it("monta o manifest com data.id em minúsculas e omite o par que falta", () => {
    expect(buildSignatureManifest({ dataId: "ORD01AB", requestId: "req-1", ts: "9" })).toBe(
      "id:ord01ab;request-id:req-1;ts:9;",
    );
    expect(buildSignatureManifest({ dataId: "ORD01AB", requestId: null, ts: "9" })).toBe(
      "id:ord01ab;ts:9;",
    );
  });
});

describe("parseWebhook do Mercado Pago (spec F2-03, RF-06)", () => {
  it("aceita a notificação assinada, com o data.id da query em minúsculas no HMAC", async () => {
    expect(await gateway.parseWebhook(signedRequest())).toEqual({
      valid: true,
      externalId: `${GATEWAY_ORDER_ID}:order.processed`,
      gatewayOrderId: GATEWAY_ORDER_ID,
      gatewayPaymentId: null,
    });
  });

  it("aceita sem x-request-id, com o par omitido do manifest", async () => {
    expect((await gateway.parseWebhook(signedRequest({ requestId: null }))).valid).toBe(true);
  });

  it("ações diferentes da mesma order têm externalId diferentes", async () => {
    const created = await gateway.parseWebhook(signedRequest({ action: "order.action_required" }));
    const processed = await gateway.parseWebhook(signedRequest());
    expect(created.valid && processed.valid && created.externalId !== processed.externalId).toBe(
      true,
    );
  });

  it("recusa assinatura adulterada, de outro segredo, sem v1 ou ausente", async () => {
    const valid = signedRequest();
    const manifest = `id:${GATEWAY_ORDER_ID.toLowerCase()};request-id:${WEBHOOK_REQUEST_ID};ts:${WEBHOOK_TS};`;
    const requestList: WebhookRequest[] = [
      signedRequest({ signature: "0".repeat(64) }),
      signedRequest({ signature: sign(manifest, "outro-segredo") }),
      signedRequest({ signature: sign(manifest.replace(WEBHOOK_TS, "1")) }),
      { ...valid, queryMap: { ...valid.queryMap, "data.id": "ORD01OUTRA" } },
      { ...valid, headerMap: { ...valid.headerMap, "X-Request-Id": "outro" } },
      { ...valid, headerMap: { ...valid.headerMap, "X-Signature": `ts=${WEBHOOK_TS}` } },
      { ...valid, headerMap: { "X-Request-Id": WEBHOOK_REQUEST_ID } },
      { ...valid, headerMap: { ...valid.headerMap, "X-Signature": `ts=${WEBHOOK_TS},v1=abc` } },
    ];
    for (const request of requestList) {
      expect(await gateway.parseWebhook(request)).toEqual({
        valid: false,
        reason: "invalid_signature",
      });
    }
  });

  it("type diferente de order é unsupported_event; sem data.id ou com corpo inválido é malformed", async () => {
    const valid = signedRequest();
    expect(
      await gateway.parseWebhook({ ...valid, queryMap: { ...valid.queryMap, type: "payment" } }),
    ).toEqual({ valid: false, reason: "unsupported_event" });
    expect(await gateway.parseWebhook({ ...valid, queryMap: { type: "order" } })).toEqual({
      valid: false,
      reason: "malformed",
    });
    for (const rawBody of ["{", JSON.stringify({ data: { id: GATEWAY_ORDER_ID } })]) {
      expect(await gateway.parseWebhook({ ...valid, rawBody })).toEqual({
        valid: false,
        reason: "malformed",
      });
    }
  });

  it("o id do corpo não é usado: corpo de outra order com a query assinada fica com a order da query", async () => {
    const valid = signedRequest();
    const body = { ...orderWebhookBody("order.processed"), data: { id: "ORD01OUTRA" } };
    const parsed = await gateway.parseWebhook({ ...valid, rawBody: JSON.stringify(body) });
    expect(parsed.valid && parsed.gatewayOrderId).toBe(GATEWAY_ORDER_ID);
  });

  it("action acima do teto é malformed, porque entra no external_id (spec F2-04, RF-07)", async () => {
    const tooLong = "a".repeat(MAX_WEBHOOK_ACTION_LENGTH + 1);
    expect(await gateway.parseWebhook(signedRequest({ action: tooLong }))).toEqual({
      valid: false,
      reason: "malformed",
    });
    const atLimit = "a".repeat(MAX_WEBHOOK_ACTION_LENGTH);
    expect((await gateway.parseWebhook(signedRequest({ action: atLimit }))).valid).toBe(true);
  });
});

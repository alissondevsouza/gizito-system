import { describe, expect, it } from "bun:test";
import {
  type ChargeStatus,
  chargeExpireDatetime,
  KIT_PRICE_CENTS,
  PaymentGatewayError,
  type PaymentGatewayErrorCode,
} from "@gizito/core";
import {
  createdOrderResponse,
  errorResponse,
  GATEWAY_ORDER_ID,
  GATEWAY_PAYMENT_ID,
  orderStatusResponse,
  PIX_QR_CODE,
  PIX_QR_CODE_BASE64,
  REFUND_ID,
  refundResponse,
  TICKET_URL,
} from "#src/__tests__/payment/__fixtures__/mercadopago.ts";
import { formatCentsAsDecimal, parseDecimalAsCents } from "#src/mercadopago/amount.ts";
import {
  createMercadoPagoGateway,
  MERCADOPAGO_API_BASE_URL,
} from "#src/mercadopago/mercadopago-gateway.ts";

const ACCESS_TOKEN = "APP_USR-token-de-teste";
const CHARGE_ID = "11111111-1111-4111-8111-111111111111";
const ORDER_ID = "22222222-2222-4222-8222-222222222222";
const PAYER_EMAIL = "mae.da.ana@example.com";
const NOW = new Date("2026-10-22T12:00:00.000Z");

const input = {
  chargeId: CHARGE_ID,
  orderId: ORDER_ID,
  amountCents: KIT_PRICE_CENTS,
  payerEmail: PAYER_EMAIL,
  expireDatetime: chargeExpireDatetime(NOW),
};

const reference = {
  chargeId: CHARGE_ID,
  gatewayOrderId: GATEWAY_ORDER_ID,
  gatewayPaymentId: GATEWAY_PAYMENT_ID,
};

type RecordedRequest = {
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  readonly body: string | null;
};

type ScriptedReply = { readonly status: number; readonly body: unknown } | "network" | "timeout";

function jsonReply(status: number, body: unknown): ScriptedReply {
  return { status, body };
}

function scriptedFetch(replyList: readonly ScriptedReply[]) {
  const requestList: RecordedRequest[] = [];
  const pending = [...replyList];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    requestList.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? init.body : null,
    });
    const reply = pending.shift();
    if (reply === undefined) throw new Error("resposta não roteirizada");
    if (reply === "network") throw new TypeError("fetch failed");
    if (reply === "timeout") throw new DOMException("The operation timed out.", "TimeoutError");
    const text = typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body);
    return new Response(text, {
      status: reply.status,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetch: fetchImpl as typeof fetch, requestList };
}

function gatewayWith(replyList: readonly ScriptedReply[]) {
  const scripted = scriptedFetch(replyList);
  const gateway = createMercadoPagoGateway({
    accessToken: ACCESS_TOKEN,
    webhookSecret: "segredo-do-webhook",
    fetch: scripted.fetch,
    retryDelayMs: 0,
  });
  return { gateway, requestList: scripted.requestList };
}

async function caughtGatewayError(promise: Promise<unknown>): Promise<PaymentGatewayError> {
  const caught = await promise.then(
    () => null,
    (error: unknown) => error,
  );
  if (!(caught instanceof PaymentGatewayError)) throw new Error("esperava PaymentGatewayError");
  return caught;
}

describe("valores em centavos (spec F2-03, RF-06)", () => {
  it("formata sem float e lê decimais de uma e duas casas", () => {
    expect(formatCentsAsDecimal(2990)).toBe("29.90");
    expect(formatCentsAsDecimal(5)).toBe("0.05");
    expect(formatCentsAsDecimal(100)).toBe("1.00");
    expect(parseDecimalAsCents("29.90")).toBe(2990);
    expect(parseDecimalAsCents("29.9")).toBe(2990);
    expect(parseDecimalAsCents("30")).toBe(3000);
    for (const invalid of ["29.901", "-29.90", "29,90", "", "abc", "1e3"]) {
      expect(parseDecimalAsCents(invalid)).toBeNull();
    }
  });
});

describe("createCharge na Orders API (spec F2-03, RF-06)", () => {
  it("envia o pedido de Pix com a chave de idempotência e sem CPF, e lê a resposta", async () => {
    const { gateway, requestList } = gatewayWith([
      jsonReply(201, createdOrderResponse({ externalReference: ORDER_ID })),
    ]);
    expect(await gateway.createCharge(input)).toEqual({
      gatewayOrderId: GATEWAY_ORDER_ID,
      gatewayPaymentId: GATEWAY_PAYMENT_ID,
      qrCode: PIX_QR_CODE,
      qrCodeBase64: PIX_QR_CODE_BASE64,
      ticketUrl: TICKET_URL,
      expireDatetime: input.expireDatetime,
    });
    const [request] = requestList;
    expect(request?.url).toBe(`${MERCADOPAGO_API_BASE_URL}/v1/orders`);
    expect(request?.method).toBe("POST");
    expect(request?.headers.get("authorization")).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(request?.headers.get("x-idempotency-key")).toBe(CHARGE_ID);
    expect(JSON.parse(request?.body ?? "null")).toEqual({
      type: "online",
      processing_mode: "automatic",
      external_reference: ORDER_ID,
      total_amount: "29.90",
      transactions: {
        payments: [
          {
            amount: "29.90",
            payment_method: { id: "pix", type: "bank_transfer" },
            expiration_time: "PT30M",
          },
        ],
      },
      payer: { email: PAYER_EMAIL },
    });
    expect(request?.body).not.toMatch(/identification|cpf/i);
  });

  it("qr_code_base64 vazio, como no sandbox, vira nulo; ticket_url fora de https vira nulo", async () => {
    const { gateway } = gatewayWith([
      jsonReply(
        201,
        createdOrderResponse({
          externalReference: ORDER_ID,
          qrCodeBase64: "",
          ticketUrl: "http://inseguro.example/ticket",
        }),
      ),
    ]);
    const created = await gateway.createCharge(input);
    expect(created.qrCodeBase64).toBeNull();
    expect(created.ticketUrl).toBeNull();
  });

  it("500 seguido de 201 dá certo, com a mesma chave de idempotência nas duas tentativas", async () => {
    const { gateway, requestList } = gatewayWith([
      jsonReply(500, errorResponse("internal_error")),
      jsonReply(201, createdOrderResponse({ externalReference: ORDER_ID })),
    ]);
    expect((await gateway.createCharge(input)).gatewayOrderId).toBe(GATEWAY_ORDER_ID);
    expect(requestList.map((request) => request.headers.get("x-idempotency-key"))).toEqual([
      CHARGE_ID,
      CHARGE_ID,
    ]);
    expect(requestList[0]?.body).toBe(requestList[1]?.body ?? "");
  });

  it.each<[string, ScriptedReply[], PaymentGatewayErrorCode, number]>([
    ["401", [jsonReply(401, errorResponse("unauthorized"))], "gateway_rejected", 1],
    [
      "409 de chave já usada",
      [jsonReply(409, errorResponse("idempotency_key_already_used"))],
      "gateway_rejected",
      1,
    ],
    ["429", [jsonReply(429, errorResponse("too_many_requests"))], "gateway_unavailable", 1],
    [
      "500 duas vezes",
      [jsonReply(500, errorResponse("internal_error")), jsonReply(503, "indisponível")],
      "gateway_unavailable",
      2,
    ],
    ["rede duas vezes", ["network", "network"], "gateway_unavailable", 2],
    ["timeout duas vezes", ["timeout", "timeout"], "gateway_unavailable", 2],
    ["JSON quebrado", [jsonReply(201, "{")], "gateway_response_invalid", 1],
    [
      "resposta sem qr_code",
      [jsonReply(201, { id: GATEWAY_ORDER_ID, transactions: { payments: [] } })],
      "gateway_response_invalid",
      1,
    ],
  ])("%s vira %s depois de %d chamada(s)", async (_, replyList, code, callCount) => {
    const { gateway, requestList } = gatewayWith(replyList);
    const error = await caughtGatewayError(gateway.createCharge(input));
    expect(error.code).toBe(code);
    expect(requestList).toHaveLength(callCount);
  });

  it("a causa do erro leva só o status e o código do fornecedor, nunca o corpo com o e-mail", async () => {
    const { gateway } = gatewayWith([
      jsonReply(400, {
        errors: [{ code: "invalid_payer", message: `e-mail ${PAYER_EMAIL} recusado`, details: [] }],
      }),
    ]);
    const error = await caughtGatewayError(gateway.createCharge(input));
    expect(error.cause).toEqual({ status: 400, providerCode: "invalid_payer" });
    expect(JSON.stringify(error.cause)).not.toContain(PAYER_EMAIL);
    expect(error.message).not.toContain(PAYER_EMAIL);
  });

  it("aplica o timeout configurado em cada chamada", async () => {
    const signalList: (AbortSignal | null | undefined)[] = [];
    const gateway = createMercadoPagoGateway({
      accessToken: ACCESS_TOKEN,
      webhookSecret: "segredo",
      requestTimeoutMs: 20,
      retryDelayMs: 0,
      fetch: (async (_url: string | URL | Request, init?: RequestInit) => {
        signalList.push(init?.signal);
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        });
      }) as typeof fetch,
    });
    const error = await caughtGatewayError(gateway.createCharge(input));
    expect(error.code).toBe("gateway_unavailable");
    expect(signalList).toHaveLength(2);
  });
});

describe("getChargeStatus na Orders API (spec F2-03, RF-06)", () => {
  it.each<[string, string, ChargeStatus]>([
    ["created", "created", "pending"],
    ["processing", "in_process", "pending"],
    ["action_required", "waiting_transfer", "pending"],
    ["processed", "accredited", "paid"],
    ["processed", "partially_refunded", "paid"],
    ["charged_back", "in_process", "paid"],
    ["charged_back", "settled", "paid"],
    ["charged_back", "reimbursed", "refunded"],
    ["canceled", "expired", "expired"],
    ["canceled", "canceled", "expired"],
    ["failed", "expired", "expired"],
    ["failed", "failed", "expired"],
    ["refunded", "refunded", "refunded"],
  ])("order %s/%s vira %s", async (status, statusDetail, expected) => {
    const { gateway, requestList } = gatewayWith([
      jsonReply(200, orderStatusResponse({ externalReference: ORDER_ID, status, statusDetail })),
    ]);
    const result = await gateway.getChargeStatus(reference);
    expect(result).toEqual({
      status: expected,
      gatewayPaymentId: GATEWAY_PAYMENT_ID,
      amountCents: KIT_PRICE_CENTS,
      externalReference: ORDER_ID,
      paidDatetime: expected === "paid" ? new Date("2026-10-22T12:04:42.109Z") : null,
    });
    expect(requestList[0]?.url).toBe(`${MERCADOPAGO_API_BASE_URL}/v1/orders/${GATEWAY_ORDER_ID}`);
    expect(requestList[0]?.method).toBe("GET");
  });

  it.each([
    ["status desconhecido", { status: "on_hold", statusDetail: "x" }],
    ["charged_back sem detalhe conhecido", { status: "charged_back", statusDetail: "x" }],
    [
      "valor com três casas",
      { status: "processed", statusDetail: "accredited", totalAmount: "29.901" },
    ],
    ["valor zero", { status: "processed", statusDetail: "accredited", totalAmount: "0.00" }],
  ])("%s vira gateway_response_invalid", async (_, fields) => {
    const { gateway } = gatewayWith([
      jsonReply(200, orderStatusResponse({ externalReference: ORDER_ID, ...fields })),
    ]);
    expect((await caughtGatewayError(gateway.getChargeStatus(reference))).code).toBe(
      "gateway_response_invalid",
    );
  });

  it("escapa o id da order no caminho e retenta 5xx uma vez", async () => {
    const { gateway, requestList } = gatewayWith([
      jsonReply(502, "bad gateway"),
      jsonReply(
        200,
        orderStatusResponse({
          externalReference: ORDER_ID,
          status: "action_required",
          statusDetail: "waiting_transfer",
        }),
      ),
    ]);
    await gateway.getChargeStatus({ ...reference, gatewayOrderId: "ORD/../x" });
    expect(requestList.map((request) => request.url)).toEqual([
      `${MERCADOPAGO_API_BASE_URL}/v1/orders/ORD%2F..%2Fx`,
      `${MERCADOPAGO_API_BASE_URL}/v1/orders/ORD%2F..%2Fx`,
    ]);
  });
});

describe("refund na Orders API (spec F2-03, RF-06)", () => {
  it("pede o reembolso total sem corpo, com chave própria, e devolve o id do reembolso", async () => {
    const { gateway, requestList } = gatewayWith([jsonReply(200, refundResponse)]);
    expect(await gateway.refund(reference)).toEqual({ refundId: REFUND_ID });
    const [request] = requestList;
    expect(request?.url).toBe(`${MERCADOPAGO_API_BASE_URL}/v1/orders/${GATEWAY_ORDER_ID}/refund`);
    expect(request?.method).toBe("POST");
    expect(request?.body).toBeNull();
    expect(request?.headers.get("x-idempotency-key")).toBe(`refund-${CHARGE_ID}`);
  });

  it("resposta sem reembolso é gateway_response_invalid", async () => {
    const { gateway } = gatewayWith([jsonReply(200, { transactions: { refunds: [] } })]);
    expect((await caughtGatewayError(gateway.refund(reference))).code).toBe(
      "gateway_response_invalid",
    );
  });
});

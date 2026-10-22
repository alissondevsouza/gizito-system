import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
  buildCharge,
  CHARGE_ID,
  ORDER_ID,
  SHORT_CODE,
} from "#src/__tests__/__fixtures__/entities.ts";
import { MAX_SIGNED_URL_TTL_SECONDS, SIGNED_URL_TTL_SECONDS } from "#src/constants.ts";
import {
  type AiCallResult,
  type AiProvider,
  type AiRequest,
  aiFailureCodeList,
  aiUsageSchema,
  isInvalidOutputAiFailureCode,
  isRetryableAiFailureCode,
} from "#src/interfaces/ai-provider.ts";
import type { MathEvaluator } from "#src/interfaces/math-evaluator.ts";
import {
  type NotificationChannel,
  type OutboundNotification,
  outboundNotificationSchema,
  recipientHashSchema,
  sendResultSchema,
} from "#src/interfaces/notification-channel.ts";
import {
  type ObjectStorage,
  ObjectStorageError,
  objectStorageErrorCodeList,
  putObjectInputSchema,
  signedUrlTtlSecondsSchema,
} from "#src/interfaces/object-storage.ts";
import {
  chargeStatusResultSchema,
  createChargeInputSchema,
  createdChargeSchema,
  type PaymentGateway,
  PaymentGatewayError,
  parsedWebhookSchema,
  paymentGatewayErrorCodeList,
} from "#src/interfaces/payment-gateway.ts";
import { expectedAnswerSchema } from "#src/pedagogy/expected-answer.ts";
import { err, ok } from "#src/result.ts";
import { photoStorageKey } from "#src/storage/keys.ts";

const PHOTO_ID = "66666666-6666-4666-8666-666666666666";

describe("contratos das interfaces: um fake mínimo compila e devolve tipos validáveis", () => {
  it("PaymentGateway", async () => {
    const charge = buildCharge();
    const canceledList: string[] = [];
    const gateway: PaymentGateway = {
      name: "fake",
      createCharge: async (input) => ({
        gatewayOrderId: `gw-${input.chargeId}`,
        gatewayPaymentId: null,
        qrCode: charge.qrCode,
        qrCodeBase64: charge.qrCodeBase64,
        ticketUrl: null,
        expireDatetime: input.expireDatetime,
      }),
      getChargeStatus: async (reference) => ({
        status: "pending",
        gatewayPaymentId: reference.gatewayPaymentId,
        amountCents: charge.amountCents,
        externalReference: ORDER_ID,
        paidDatetime: null,
      }),
      refund: async () => ({ refundId: "ref-1" }),
      cancelCharge: async (reference) => {
        canceledList.push(reference.gatewayOrderId);
      },
      parseWebhook: async (request) =>
        request.headerMap["x-signature"]
          ? { valid: true, externalId: "evt-1", gatewayOrderId: "gw-1", gatewayPaymentId: null }
          : { valid: false, reason: "invalid_signature" },
    };
    const input = createChargeInputSchema.parse({
      chargeId: CHARGE_ID,
      orderId: ORDER_ID,
      amountCents: 2990,
      payerEmail: "mae@example.com",
      expireDatetime: charge.expireDatetime,
    });
    const created = await gateway.createCharge(input);
    expect(createdChargeSchema.safeParse(created).success).toBe(true);
    expect(
      createdChargeSchema.safeParse({ ...created, ticketUrl: "javascript:alert(1)" }).success,
    ).toBe(false);
    expect(
      createdChargeSchema.safeParse({ ...created, ticketUrl: "http://mp.example/t" }).success,
    ).toBe(false);
    const status = await gateway.getChargeStatus({
      chargeId: CHARGE_ID,
      gatewayOrderId: "gw-1",
      gatewayPaymentId: null,
    });
    expect(chargeStatusResultSchema.safeParse(status).success).toBe(true);
    const rejected = await gateway.parseWebhook({ headerMap: {}, queryMap: {}, rawBody: "{}" });
    expect(parsedWebhookSchema.parse(rejected)).toEqual({
      valid: false,
      reason: "invalid_signature",
    });
    const accepted = await gateway.parseWebhook({
      headerMap: { "x-signature": "ts=1,v1=abc" },
      queryMap: {},
      rawBody: "{}",
    });
    expect(parsedWebhookSchema.parse(accepted).valid).toBe(true);
    expect(
      await gateway.refund({
        chargeId: CHARGE_ID,
        gatewayOrderId: "gw-1",
        gatewayPaymentId: "pay-1",
      }),
    ).toEqual({
      refundId: "ref-1",
    });
    await gateway.cancelCharge({
      chargeId: CHARGE_ID,
      gatewayOrderId: "gw-2",
      gatewayPaymentId: null,
    });
    expect(canceledList).toEqual(["gw-2"]);
  });

  it("PaymentGateway: qrCodeBase64 pode faltar, mas nunca vem vazio", () => {
    const created = {
      gatewayOrderId: "gw-1",
      gatewayPaymentId: "pay-1",
      qrCode: "000201",
      qrCodeBase64: null,
      ticketUrl: null,
      expireDatetime: new Date("2026-10-15T12:30:00.000Z"),
    };
    expect(createdChargeSchema.safeParse(created).success).toBe(true);
    expect(createdChargeSchema.safeParse({ ...created, qrCodeBase64: "" }).success).toBe(false);
  });

  it("PaymentGatewayError leva código estável e não expõe a causa na mensagem", () => {
    const cause = { status: 500, providerCode: "internal_error" };
    const error = new PaymentGatewayError("gateway_unavailable", { cause });
    expect(error.name).toBe("PaymentGatewayError");
    expect(error.code).toBe("gateway_unavailable");
    expect(error.cause).toBe(cause);
    expect(error.message).not.toContain("internal_error");
    expect(paymentGatewayErrorCodeList).toEqual([
      "gateway_unavailable",
      "gateway_rejected",
      "gateway_response_invalid",
    ]);
  });

  it("NotificationChannel", async () => {
    const sentList: string[] = [];
    const channel: NotificationChannel = {
      channel: "email",
      send: async (notification) => {
        sentList.push(notification.kind);
        return { status: "sent", providerMessageId: "msg-1" };
      },
    };
    const notification = outboundNotificationSchema.parse({
      orderId: ORDER_ID,
      kind: "kit_ready",
      channel: "email",
      recipient: "mae@example.com",
      shortCode: SHORT_CODE,
      orderUrl: "https://gizito.example/pedido/abc",
      textBody: null,
      attachmentList: [],
    });
    expect(sendResultSchema.safeParse(await channel.send(notification)).success).toBe(true);
    expect(sentList).toEqual(["kit_ready"]);
    expect(
      outboundNotificationSchema.safeParse({ ...notification, recipient: "nem-email-nem-fone" })
        .success,
    ).toBe(false);
    expect(
      outboundNotificationSchema.safeParse({
        ...notification,
        recipient: "+5511999998888",
        channel: "whatsapp",
      }).success,
    ).toBe(true);
    expect(
      outboundNotificationSchema.safeParse({ ...notification, orderUrl: "javascript:alert(1)" })
        .success,
    ).toBe(false);
    expect(
      outboundNotificationSchema.safeParse({
        ...notification,
        orderId: undefined,
        shortCode: undefined,
      }).success,
    ).toBe(false);
  });

  it("NotificationChannel: ajuda do WhatsApp não tem pedido e só vai por WhatsApp", () => {
    const help: OutboundNotification = {
      kind: "whatsapp_help",
      channel: "whatsapp",
      recipient: "+5511999998888",
      textBody: "Envie o código do pedido, por exemplo GZ-7K3M9Q.",
      attachmentList: [],
    };
    expect(outboundNotificationSchema.parse(help)).toEqual(help);
    expect(
      outboundNotificationSchema.safeParse({ ...help, orderId: ORDER_ID, shortCode: SHORT_CODE })
        .success,
    ).toBe(false);
    expect(
      outboundNotificationSchema.safeParse({
        ...help,
        channel: "email",
        recipient: "mae@example.com",
      }).success,
    ).toBe(false);
    expect(recipientHashSchema.safeParse("a".repeat(64)).success).toBe(true);
    expect(recipientHashSchema.safeParse("mae@example.com").success).toBe(false);
  });

  it("AiProvider devolve Result com output tipado pelo schema pedido, usage e versão do prompt", async () => {
    const respond = async <T>(request: AiRequest<T>): Promise<AiCallResult<T>> => {
      const parsed = request.outputSchema.safeParse({ topicIdList: ["mat-5-fracoes"] });
      const base = { model: "fake-model", promptVersion: request.promptVersion, durationMs: 1 };
      const usage = { inputTokens: 10, outputTokens: 5, costCents: 0.2 };
      return parsed.success
        ? ok({ ...base, output: parsed.data, usage })
        : err({ ...base, code: "ai_output_invalid", usage });
    };
    const provider: AiProvider = {
      extract: respond,
      plan: respond,
      generate: respond,
      review: respond,
    };
    const outputSchema = z.object({ topicIdList: z.array(z.string()) });
    const result = await provider.extract({
      promptVersion: "extract.v1",
      systemPrompt: "system",
      userText: "data",
      imageList: [{ mediaType: "image/jpeg", data: new Uint8Array([1, 2, 3]) }],
      outputSchema,
      signal: new AbortController().signal,
    });
    expect(result.ok && result.value.output.topicIdList).toEqual(["mat-5-fracoes"]);
    expect(result.ok && result.value.promptVersion).toBe("extract.v1");
    expect(result.ok && aiUsageSchema.safeParse(result.value.usage).success).toBe(true);
    const failed = await provider.plan({
      promptVersion: "plan.v1",
      systemPrompt: "system",
      userText: "data",
      outputSchema: z.object({ planId: z.string() }),
    });
    expect(failed.ok ? null : failed.error.code).toBe("ai_output_invalid");
    expect(
      aiUsageSchema.safeParse({ inputTokens: -1, outputTokens: 0, costCents: 0 }).success,
    ).toBe(false);
  });

  it.each(aiFailureCodeList.map((code) => [code] as const))(
    "%s volta à fila só quando é transitório",
    (code) => {
      const transientCodeList: readonly string[] = [
        "ai_timeout",
        "ai_rate_limited",
        "ai_unavailable",
        "ai_aborted",
      ];
      expect(isRetryableAiFailureCode(code)).toBe(transientCodeList.includes(code));
    },
  );

  it.each(aiFailureCodeList.map((code) => [code] as const))(
    "%s é saída inválida só quando o modelo respondeu algo que não serve",
    (code) => {
      const invalidOutputCodeList: readonly string[] = [
        "ai_refused",
        "ai_output_truncated",
        "ai_output_invalid",
      ];
      expect(isInvalidOutputAiFailureCode(code)).toBe(invalidOutputCodeList.includes(code));
    },
  );

  it("ObjectStorage", async () => {
    const store = new Map<string, Uint8Array<ArrayBuffer>>();
    const storage: ObjectStorage = {
      putPrivate: async (input) => {
        store.set(input.key, input.body);
      },
      get: async (key) => {
        const body = store.get(key);
        if (body === undefined) throw new ObjectStorageError("storage_not_found");
        return body;
      },
      getSignedUrl: async (key, ttlSeconds) => `https://storage.example/${key}?ttl=${ttlSeconds}`,
      delete: async (key) => {
        store.delete(key);
      },
    };
    const key = photoStorageKey(ORDER_ID, PHOTO_ID);
    const input = putObjectInputSchema.parse({
      key,
      body: new Uint8Array([255, 216]),
      contentType: "image/jpeg",
    });
    await storage.putPrivate(input);
    expect(store.has(key)).toBe(true);
    expect(await storage.get(key)).toEqual(input.body);
    expect(await storage.getSignedUrl(key, 600)).toContain("ttl=600");
    await storage.delete(key);
    expect(store.has(key)).toBe(false);
    expect(putObjectInputSchema.safeParse({ ...input, contentType: "text/html" }).success).toBe(
      false,
    );
    expect(putObjectInputSchema.safeParse({ ...input, key: "photos/x/y.jpg" }).success).toBe(false);
  });

  it("ObjectStorage limita o TTL da URL assinada e falha com código estável", () => {
    expect(signedUrlTtlSecondsSchema.safeParse(SIGNED_URL_TTL_SECONDS).success).toBe(true);
    expect(signedUrlTtlSecondsSchema.safeParse(MAX_SIGNED_URL_TTL_SECONDS).success).toBe(true);
    for (const ttl of [0, -1, 1.5, MAX_SIGNED_URL_TTL_SECONDS + 1]) {
      expect(signedUrlTtlSecondsSchema.safeParse(ttl).success).toBe(false);
    }
    const cause = new Error("detalhe do fornecedor");
    const error = new ObjectStorageError("storage_unavailable", { cause });
    expect(error.name).toBe("ObjectStorageError");
    expect(error.code).toBe("storage_unavailable");
    expect(error.cause).toBe(cause);
    expect(error.message).not.toContain("detalhe");
    expect(objectStorageErrorCodeList).toEqual([
      "storage_unavailable",
      "storage_rejected",
      "storage_not_found",
    ]);
  });

  it("MathEvaluator devolve Result com ExpectedAnswer ou erro tipado", () => {
    const evaluator: MathEvaluator = {
      evaluate: (expression) =>
        expression === "1/2"
          ? ok({ kind: "fraction", numerator: 1, denominator: 2, unit: null })
          : err({ code: "parse_error", expression }),
      equals: (left, right) => JSON.stringify(left) === JSON.stringify(right),
    };
    const result = evaluator.evaluate("1/2");
    expect(result.ok).toBe(true);
    if (result.ok) expect(expectedAnswerSchema.safeParse(result.value).success).toBe(true);
    const failure = evaluator.evaluate("??");
    expect(failure).toEqual({ ok: false, error: { code: "parse_error", expression: "??" } });
    expect(
      evaluator.equals(
        { kind: "expression", expression: "x" },
        { kind: "expression", expression: "x" },
      ),
    ).toBe(true);
  });
});

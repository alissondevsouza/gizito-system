import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
  buildCharge,
  CHARGE_ID,
  ORDER_ID,
  SHORT_CODE,
} from "#src/__tests__/__fixtures__/entities.ts";
import {
  type AiProvider,
  type AiRequest,
  type AiResult,
  aiUsageSchema,
} from "#src/interfaces/ai-provider.ts";
import type { MathEvaluator } from "#src/interfaces/math-evaluator.ts";
import {
  type NotificationChannel,
  type OutboundNotification,
  outboundNotificationSchema,
  recipientHashSchema,
  sendResultSchema,
} from "#src/interfaces/notification-channel.ts";
import { type ObjectStorage, putObjectInputSchema } from "#src/interfaces/object-storage.ts";
import {
  chargeStatusResultSchema,
  createChargeInputSchema,
  createdChargeSchema,
  type PaymentGateway,
  parsedWebhookSchema,
} from "#src/interfaces/payment-gateway.ts";
import { expectedAnswerSchema } from "#src/pedagogy/expected-answer.ts";
import { err, ok } from "#src/result.ts";
import { photoStorageKey } from "#src/storage/keys.ts";

const PHOTO_ID = "66666666-6666-4666-8666-666666666666";

describe("contratos das interfaces: um fake mínimo compila e devolve tipos validáveis", () => {
  it("PaymentGateway", async () => {
    const charge = buildCharge();
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
    expect(createdChargeSchema.safeParse(await gateway.createCharge(input)).success).toBe(true);
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

  it("AiProvider devolve output tipado pelo schema pedido, com usage e versão do prompt", async () => {
    const respond = async <T>(request: AiRequest<T>): Promise<AiResult<T>> => ({
      output: request.outputSchema.parse({ topicIdList: ["mat-5-fracoes"] }),
      usage: { inputTokens: 10, outputTokens: 5, costCents: 0.2 },
      model: "fake-model",
      promptVersion: request.promptVersion,
      durationMs: 1,
    });
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
    });
    expect(result.output.topicIdList).toEqual(["mat-5-fracoes"]);
    expect(result.promptVersion).toBe("extract.v1");
    expect(aiUsageSchema.safeParse(result.usage).success).toBe(true);
    expect(
      aiUsageSchema.safeParse({ inputTokens: -1, outputTokens: 0, costCents: 0 }).success,
    ).toBe(false);
  });

  it("ObjectStorage", async () => {
    const store = new Map<string, Uint8Array>();
    const storage: ObjectStorage = {
      putPrivate: async (input) => {
        store.set(input.key, input.body);
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
    expect(await storage.getSignedUrl(key, 600)).toContain("ttl=600");
    await storage.delete(key);
    expect(store.has(key)).toBe(false);
    expect(putObjectInputSchema.safeParse({ ...input, contentType: "text/html" }).success).toBe(
      false,
    );
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

import { z } from "zod";
import { guidSchema, httpsUrlSchema } from "#src/common.ts";
import { chargeStatusSchema, type PaymentGatewayName } from "#src/enums.ts";
import { emailSchema } from "#src/order/schemas.ts";

export const createChargeInputSchema = z.object({
  chargeId: guidSchema,
  orderId: guidSchema,
  amountCents: z.int().positive(),
  payerEmail: emailSchema,
  expireDatetime: z.date(),
});
export type CreateChargeInput = z.infer<typeof createChargeInputSchema>;

export const createdChargeSchema = z.object({
  gatewayOrderId: z.string().min(1),
  gatewayPaymentId: z.string().min(1).nullable(),
  qrCode: z.string().min(1),
  qrCodeBase64: z.string().min(1).nullable(),
  ticketUrl: httpsUrlSchema.nullable(),
  expireDatetime: z.date(),
});
export type CreatedCharge = z.infer<typeof createdChargeSchema>;

export const chargeReferenceSchema = z.object({
  chargeId: guidSchema,
  gatewayOrderId: z.string().min(1),
  gatewayPaymentId: z.string().min(1).nullable(),
});
export type ChargeReference = z.infer<typeof chargeReferenceSchema>;

export const chargeStatusResultSchema = z.object({
  status: chargeStatusSchema,
  gatewayPaymentId: z.string().min(1).nullable(),
  amountCents: z.int().positive(),
  externalReference: z.string().min(1).nullable(),
  paidDatetime: z.date().nullable(),
});
export type ChargeStatusResult = z.infer<typeof chargeStatusResultSchema>;

export const refundResultSchema = z.object({
  refundId: z.string().min(1),
});
export type RefundResult = z.infer<typeof refundResultSchema>;

export const webhookRequestSchema = z.object({
  headerMap: z.record(z.string(), z.string()),
  queryMap: z.record(z.string(), z.string()),
  rawBody: z.string(),
});
export type WebhookRequest = z.infer<typeof webhookRequestSchema>;

export const webhookRejectReasonList = [
  "invalid_signature",
  "malformed",
  "unsupported_event",
] as const;
export const webhookRejectReasonSchema = z.enum(webhookRejectReasonList);
export type WebhookRejectReason = z.infer<typeof webhookRejectReasonSchema>;

export const parsedWebhookSchema = z.discriminatedUnion("valid", [
  z.object({
    valid: z.literal(true),
    externalId: z.string().min(1),
    gatewayOrderId: z.string().min(1).nullable(),
    gatewayPaymentId: z.string().min(1).nullable(),
  }),
  z.object({
    valid: z.literal(false),
    reason: webhookRejectReasonSchema,
  }),
]);
export type ParsedWebhook = z.infer<typeof parsedWebhookSchema>;

export const paymentGatewayErrorCodeList = [
  "gateway_unavailable",
  "gateway_rejected",
  "gateway_response_invalid",
] as const;
export const paymentGatewayErrorCodeSchema = z.enum(paymentGatewayErrorCodeList);
export type PaymentGatewayErrorCode = z.infer<typeof paymentGatewayErrorCodeSchema>;

export class PaymentGatewayError extends Error {
  constructor(
    readonly code: PaymentGatewayErrorCode,
    options?: { cause?: unknown },
  ) {
    super(`Payment gateway failed with ${code}`, options);
    this.name = "PaymentGatewayError";
  }
}

export interface PaymentGateway {
  readonly name: PaymentGatewayName;
  createCharge(input: CreateChargeInput): Promise<CreatedCharge>;
  getChargeStatus(reference: ChargeReference): Promise<ChargeStatusResult>;
  refund(reference: ChargeReference): Promise<RefundResult>;
  cancelCharge(reference: ChargeReference): Promise<void>;
  parseWebhook(request: WebhookRequest): Promise<ParsedWebhook>;
}

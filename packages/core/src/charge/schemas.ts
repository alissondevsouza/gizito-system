import { z } from "zod";
import { guidSchema, httpsUrlSchema, timestampFieldsSchema } from "#src/common.ts";
import { chargeStatusSchema, paymentGatewaySchema } from "#src/enums.ts";

export const chargeSchema = timestampFieldsSchema.extend({
  chargeId: guidSchema,
  orderId: guidSchema,
  gateway: paymentGatewaySchema,
  gatewayOrderId: z.string().min(1).nullable(),
  gatewayPaymentId: z.string().min(1).nullable(),
  amountCents: z.int().positive(),
  status: chargeStatusSchema,
  qrCode: z.string().min(1),
  qrCodeBase64: z.string().min(1).nullable(),
  ticketUrl: httpsUrlSchema.nullable(),
  expireDatetime: z.date(),
  paidDatetime: z.date().nullable(),
  refundId: z.string().min(1).nullable(),
  refundDatetime: z.date().nullable(),
});
export type Charge = z.infer<typeof chargeSchema>;

export const markOrderPaidInputSchema = z.object({
  orderId: guidSchema,
  chargeId: guidSchema,
  gatewayPaymentId: z.string().min(1),
  paidDatetime: z.date(),
  webhookEventId: guidSchema.optional(),
});
export type MarkOrderPaidInput = z.infer<typeof markOrderPaidInputSchema>;

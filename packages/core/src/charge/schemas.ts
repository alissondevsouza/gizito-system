import { z } from "zod";
import { guidSchema, timestampFieldsSchema } from "#src/common.ts";
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
  qrCodeBase64: z.string().min(1),
  ticketUrl: z.url().nullable(),
  expireDatetime: z.date(),
  paidDatetime: z.date().nullable(),
  refundId: z.string().min(1).nullable(),
  refundDatetime: z.date().nullable(),
});
export type Charge = z.infer<typeof chargeSchema>;

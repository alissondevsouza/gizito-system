import { CHARGE_TTL_MINUTES, type ChargeStatus, type CreateChargeInput } from "@gizito/core";
import { z } from "zod";
import { formatCentsAsDecimal } from "#src/mercadopago/amount.ts";

export const PIX_PAYMENT_METHOD = { id: "pix", type: "bank_transfer" } as const;
export const PIX_EXPIRATION_TIME = `PT${CHARGE_TTL_MINUTES}M`;

export function buildCreateOrderBody({
  orderId,
  amountCents,
  payerEmail,
}: CreateChargeInput): Record<string, unknown> {
  const amount = formatCentsAsDecimal(amountCents);
  return {
    type: "online",
    processing_mode: "automatic",
    external_reference: orderId,
    total_amount: amount,
    transactions: {
      payments: [
        { amount, payment_method: PIX_PAYMENT_METHOD, expiration_time: PIX_EXPIRATION_TIME },
      ],
    },
    payer: { email: payerEmail },
  };
}

const optionalTextSchema = z.string().nullish();

export const createdOrderResponseSchema = z.object({
  id: z.string().min(1),
  transactions: z.object({
    payments: z
      .array(
        z.object({
          id: z.string().min(1),
          payment_method: z.object({
            qr_code: z.string().min(1),
            qr_code_base64: optionalTextSchema,
            ticket_url: optionalTextSchema,
          }),
        }),
      )
      .min(1),
  }),
});

export const orderStatusResponseSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  status_detail: optionalTextSchema,
  external_reference: optionalTextSchema,
  total_amount: z.string().min(1),
  last_updated_date: z.iso.datetime({ offset: true }).nullish(),
  transactions: z
    .object({ payments: z.array(z.object({ id: z.string().min(1) })).nullish() })
    .nullish(),
});

export const refundResponseSchema = z.object({
  transactions: z.object({
    refunds: z.array(z.object({ id: z.string().min(1) })).min(1),
  }),
});

export const errorResponseSchema = z.object({
  errors: z.array(z.object({ code: z.string().min(1) })).min(1),
});

const chargeStatusByOrderStatus: ReadonlyMap<string, ChargeStatus> = new Map([
  ["created", "pending"],
  ["processing", "pending"],
  ["action_required", "pending"],
  ["processed", "paid"],
  ["canceled", "expired"],
  ["failed", "expired"],
  ["refunded", "refunded"],
]);

const chargeStatusByChargebackDetail: ReadonlyMap<string, ChargeStatus> = new Map([
  ["in_process", "paid"],
  ["settled", "paid"],
  ["reimbursed", "refunded"],
]);

export function resolveChargeStatus(
  orderStatus: string,
  statusDetail: string | null,
): ChargeStatus | null {
  if (orderStatus === "charged_back") {
    return statusDetail === null
      ? null
      : (chargeStatusByChargebackDetail.get(statusDetail) ?? null);
  }
  return chargeStatusByOrderStatus.get(orderStatus) ?? null;
}

export const webhookBodySchema = z.object({ action: z.string().min(1) });

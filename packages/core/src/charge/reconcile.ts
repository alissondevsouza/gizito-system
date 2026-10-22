import { z } from "zod";
import type { Charge } from "#src/charge/schemas.ts";
import type { ChargeStatusResult } from "#src/interfaces/payment-gateway.ts";

export const chargeReconcileOutcomeList = [
  "paid",
  "already_paid",
  "duplicate_payment",
  "pending",
  "expired",
  "refunded",
  "payment_mismatch",
  "charge_not_found",
] as const;
export const chargeReconcileOutcomeSchema = z.enum(chargeReconcileOutcomeList);
export type ChargeReconcileOutcome = z.infer<typeof chargeReconcileOutcomeSchema>;

export const paymentMismatchReasonList = [
  "external_reference",
  "amount",
  "payment_id_missing",
] as const;
export const paymentMismatchReasonSchema = z.enum(paymentMismatchReasonList);
export type PaymentMismatchReason = z.infer<typeof paymentMismatchReasonSchema>;

export type ReconciledCharge = Pick<
  Charge,
  "chargeId" | "orderId" | "gatewayPaymentId" | "amountCents" | "status"
>;

export type ChargeReconciliationDecision =
  | { kind: "confirm_payment"; gatewayPaymentId: string; paidDatetime: Date }
  | { kind: "expire" }
  | {
      kind: "no_change";
      outcome: Extract<ChargeReconcileOutcome, "pending" | "expired" | "refunded">;
    }
  | { kind: "mismatch"; reason: PaymentMismatchReason };

export function decideChargeReconciliation(
  charge: ReconciledCharge,
  statusResult: ChargeStatusResult,
  now: Date,
): ChargeReconciliationDecision {
  const { externalReference, amountCents, status, gatewayPaymentId, paidDatetime } = statusResult;
  if (externalReference !== null && externalReference !== charge.orderId) {
    return { kind: "mismatch", reason: "external_reference" };
  }
  if (amountCents !== charge.amountCents) return { kind: "mismatch", reason: "amount" };
  switch (status) {
    case "paid": {
      const paymentId = gatewayPaymentId ?? charge.gatewayPaymentId;
      if (paymentId === null) return { kind: "mismatch", reason: "payment_id_missing" };
      return {
        kind: "confirm_payment",
        gatewayPaymentId: paymentId,
        paidDatetime: paidDatetime ?? now,
      };
    }
    case "expired":
      return charge.status === "pending"
        ? { kind: "expire" }
        : { kind: "no_change", outcome: "expired" };
    case "pending":
    case "refunded":
      return { kind: "no_change", outcome: status };
  }
}

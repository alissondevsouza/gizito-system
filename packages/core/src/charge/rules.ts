import type { Charge } from "#src/charge/schemas.ts";
import { CHARGE_TTL_MINUTES } from "#src/constants.ts";
import type { AwaitingPaymentSubstate, OrderStatus } from "#src/enums.ts";
import {
  type InvalidTransitionError,
  isPostPaymentOrderStatus,
  transitionOrder,
} from "#src/order/state-machine.ts";
import { err, ok, type Result } from "#src/result.ts";

type ChargeExpiry = Pick<Charge, "status" | "expireDatetime">;

const MILLISECONDS_PER_MINUTE = 60_000;

export function chargeExpireDatetime(now: Date): Date {
  return new Date(now.getTime() + CHARGE_TTL_MINUTES * MILLISECONDS_PER_MINUTE);
}

export function isChargeExpired(charge: ChargeExpiry, now: Date): boolean {
  if (charge.status === "expired") return true;
  return charge.status === "pending" && charge.expireDatetime.getTime() <= now.getTime();
}

export function isChargeActive(charge: ChargeExpiry, now: Date): boolean {
  return charge.status === "pending" && !isChargeExpired(charge, now);
}

export function deriveAwaitingPaymentSubstate(
  charge: ChargeExpiry | null,
  now: Date,
): AwaitingPaymentSubstate | null {
  if (charge === null) return null;
  return isChargeExpired(charge, now) ? "charge_expired" : null;
}

export class ChargePaymentMismatchError extends Error {
  readonly code = "charge_payment_mismatch";

  constructor(readonly chargeId: string) {
    super(`Charge ${chargeId} is bound to a different gateway payment`);
    this.name = "ChargePaymentMismatchError";
  }
}

export type PaymentConfirmationDecision =
  | { kind: "paid"; nextOrderStatus: OrderStatus }
  | { kind: "already_paid" }
  | { kind: "duplicate_payment" };

export function decidePaymentConfirmation(
  orderStatus: OrderStatus,
  charge: Pick<Charge, "chargeId" | "status" | "gatewayPaymentId">,
  gatewayPaymentId: string,
): Result<PaymentConfirmationDecision, ChargePaymentMismatchError | InvalidTransitionError> {
  const boundToOtherPayment =
    charge.gatewayPaymentId !== null && charge.gatewayPaymentId !== gatewayPaymentId;
  if (boundToOtherPayment) return err(new ChargePaymentMismatchError(charge.chargeId));
  if (charge.status === "paid" || charge.status === "refunded") return ok({ kind: "already_paid" });
  if (isPostPaymentOrderStatus(orderStatus)) return ok({ kind: "duplicate_payment" });
  const transition = transitionOrder(orderStatus, "payment_confirmed");
  if (!transition.ok) return err(transition.error);
  return ok({ kind: "paid", nextOrderStatus: transition.value });
}

import type { Charge } from "#src/charge/schemas.ts";
import { CHARGE_TTL_MINUTES } from "#src/constants.ts";
import type { AwaitingPaymentSubstate } from "#src/enums.ts";

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

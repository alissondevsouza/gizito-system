import type { Charge, PaymentGatewayName } from "@gizito/core";
import { and, asc, eq, lte } from "drizzle-orm";
import type { Executor } from "#src/client.ts";
import { charge, order } from "#src/schema/index.ts";

const MILLISECONDS_PER_MINUTE = 60_000;

export type ReconcilableCharge = Pick<
  Charge,
  | "chargeId"
  | "orderId"
  | "gatewayOrderId"
  | "gatewayPaymentId"
  | "amountCents"
  | "status"
  | "expireDatetime"
>;

const reconcilableChargeColumnMap = {
  chargeId: charge.chargeId,
  orderId: charge.orderId,
  gatewayOrderId: charge.gatewayOrderId,
  gatewayPaymentId: charge.gatewayPaymentId,
  amountCents: charge.amountCents,
  status: charge.status,
  expireDatetime: charge.expireDatetime,
};

export async function findChargeForReconcile(
  executor: Executor,
  chargeId: string,
): Promise<ReconcilableCharge | null> {
  const [row] = await executor
    .select(reconcilableChargeColumnMap)
    .from(charge)
    .where(eq(charge.chargeId, chargeId));
  return row ?? null;
}

export type GatewayOrderReference = {
  gateway: PaymentGatewayName;
  gatewayOrderId: string;
};

export async function findChargeByGatewayOrderId(
  executor: Executor,
  { gateway, gatewayOrderId }: GatewayOrderReference,
): Promise<ReconcilableCharge | null> {
  const [row] = await executor
    .select(reconcilableChargeColumnMap)
    .from(charge)
    .where(and(eq(charge.gateway, gateway), eq(charge.gatewayOrderId, gatewayOrderId)));
  return row ?? null;
}

export async function listPendingOrderCharges(
  executor: Executor,
  orderId: string,
): Promise<ReconcilableCharge[]> {
  return executor
    .select(reconcilableChargeColumnMap)
    .from(charge)
    .where(and(eq(charge.orderId, orderId), eq(charge.status, "pending")))
    .orderBy(asc(charge.insertDatetime), asc(charge.chargeId));
}

export type ListChargesToReconcileOptions = {
  now: Date;
  minAgeMinutes: number;
  limit: number;
};

export async function listChargesToReconcile(
  executor: Executor,
  { now, minAgeMinutes, limit }: ListChargesToReconcileOptions,
): Promise<ReconcilableCharge[]> {
  const cutoff = new Date(now.getTime() - minAgeMinutes * MILLISECONDS_PER_MINUTE);
  return executor
    .select(reconcilableChargeColumnMap)
    .from(charge)
    .innerJoin(order, eq(order.orderId, charge.orderId))
    .where(
      and(
        eq(charge.status, "pending"),
        lte(charge.insertDatetime, cutoff),
        eq(order.status, "awaiting_payment"),
      ),
    )
    .orderBy(asc(charge.insertDatetime), asc(charge.chargeId))
    .limit(limit);
}

export async function expireCharge(executor: Executor, chargeId: string): Promise<boolean> {
  const rowList = await executor
    .update(charge)
    .set({ status: "expired" })
    .where(and(eq(charge.chargeId, chargeId), eq(charge.status, "pending")))
    .returning({ chargeId: charge.chargeId });
  return rowList.length > 0;
}

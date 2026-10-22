import {
  CHARGE_RECONCILE_AFTER_EXPIRY_MINUTES,
  type Charge,
  decidePaymentConfirmation,
  err,
  type MarkOrderPaidInput,
  markOrderPaidInputSchema,
  type OrderStatus,
  ok,
  type PaymentConfirmationDecision,
  type PaymentConfirmationError,
  type Result,
} from "@gizito/core";
import { and, eq, ne } from "drizzle-orm";
import type { Transaction } from "#src/client.ts";
import {
  ChargeNotFoundError,
  GatewayPaymentInUseError,
  OrderNotFoundError,
  WebhookEventNotFoundError,
} from "#src/order/errors.ts";
import { enqueueJob } from "#src/queue/enqueue.ts";
import { charge, order, supportTicket, webhookEvent } from "#src/schema/index.ts";

const MILLISECONDS_PER_MINUTE = 60_000;

export type ExpiredCharge = Pick<Charge, "chargeId" | "gatewayOrderId" | "gatewayPaymentId">;

export function expiredChargeReconcileDatetime(expireDatetime: Date): Date {
  return new Date(
    expireDatetime.getTime() + CHARGE_RECONCILE_AFTER_EXPIRY_MINUTES * MILLISECONDS_PER_MINUTE,
  );
}

export type MarkOrderPaidOutcome =
  | { outcome: "paid"; generateJobId: string; expiredChargeList: ExpiredCharge[] }
  | { outcome: "already_paid" }
  | { outcome: "duplicate_payment"; supportTicketId: string };

export type MarkOrderPaidError =
  | OrderNotFoundError
  | ChargeNotFoundError
  | GatewayPaymentInUseError
  | WebhookEventNotFoundError
  | PaymentConfirmationError;

export type MarkOrderPaidOptions = {
  now?: Date;
};

type LockedPaymentTarget = {
  orderStatus: OrderStatus;
  lockedCharge: Pick<Charge, "chargeId" | "status" | "gatewayPaymentId" | "amountCents">;
};

async function lockPaymentTarget(
  tx: Transaction,
  { orderId, chargeId, gatewayPaymentId, webhookEventId }: MarkOrderPaidInput,
): Promise<Result<LockedPaymentTarget, MarkOrderPaidError>> {
  const [lockedOrder] = await tx
    .select({ status: order.status })
    .from(order)
    .where(eq(order.orderId, orderId))
    .for("update");
  if (!lockedOrder) return err(new OrderNotFoundError(orderId));
  const [lockedCharge] = await tx
    .select({
      chargeId: charge.chargeId,
      status: charge.status,
      gatewayPaymentId: charge.gatewayPaymentId,
      amountCents: charge.amountCents,
    })
    .from(charge)
    .where(and(eq(charge.chargeId, chargeId), eq(charge.orderId, orderId)))
    .for("update");
  if (!lockedCharge) return err(new ChargeNotFoundError(chargeId, orderId));
  const [chargeWithSamePayment] = await tx
    .select({ chargeId: charge.chargeId })
    .from(charge)
    .where(and(eq(charge.gatewayPaymentId, gatewayPaymentId), ne(charge.chargeId, chargeId)));
  if (chargeWithSamePayment) {
    return err(new GatewayPaymentInUseError(gatewayPaymentId, chargeWithSamePayment.chargeId));
  }
  if (webhookEventId !== undefined) {
    const [lockedWebhookEvent] = await tx
      .select({ webhookEventId: webhookEvent.webhookEventId })
      .from(webhookEvent)
      .where(eq(webhookEvent.webhookEventId, webhookEventId))
      .for("update");
    if (!lockedWebhookEvent) return err(new WebhookEventNotFoundError(webhookEventId));
  }
  return ok({ orderStatus: lockedOrder.status, lockedCharge });
}

async function markChargePaid(
  tx: Transaction,
  { chargeId, gatewayPaymentId, paidDatetime }: MarkOrderPaidInput,
): Promise<void> {
  await tx
    .update(charge)
    .set({ status: "paid", gatewayPaymentId, paidDatetime })
    .where(eq(charge.chargeId, chargeId));
}

async function confirmPayment(
  tx: Transaction,
  input: MarkOrderPaidInput,
  nextOrderStatus: OrderStatus,
): Promise<MarkOrderPaidOutcome> {
  await tx
    .update(order)
    .set({ status: nextOrderStatus, paidDatetime: input.paidDatetime })
    .where(eq(order.orderId, input.orderId));
  await markChargePaid(tx, input);
  const expiredChargeList = await tx
    .update(charge)
    .set({ status: "expired" })
    .where(
      and(
        eq(charge.orderId, input.orderId),
        ne(charge.chargeId, input.chargeId),
        eq(charge.status, "pending"),
      ),
    )
    .returning({
      chargeId: charge.chargeId,
      gatewayOrderId: charge.gatewayOrderId,
      gatewayPaymentId: charge.gatewayPaymentId,
      expireDatetime: charge.expireDatetime,
    });
  for (const expired of expiredChargeList) {
    await enqueueJob(
      tx,
      { name: "charge.reconcile", orderId: input.orderId, chargeId: expired.chargeId },
      { runAfterDatetime: expiredChargeReconcileDatetime(expired.expireDatetime) },
    );
  }
  const generateJob = await enqueueJob(tx, { name: "order.generate", orderId: input.orderId });
  return {
    outcome: "paid",
    generateJobId: generateJob.jobId,
    expiredChargeList: expiredChargeList.map(({ chargeId, gatewayOrderId, gatewayPaymentId }) => ({
      chargeId,
      gatewayOrderId,
      gatewayPaymentId,
    })),
  };
}

async function recordDuplicatePayment(
  tx: Transaction,
  input: MarkOrderPaidInput,
  orderStatus: OrderStatus,
): Promise<MarkOrderPaidOutcome> {
  await markChargePaid(tx, input);
  const [ticket] = await tx
    .insert(supportTicket)
    .values({
      orderId: input.orderId,
      kind: "duplicate_payment",
      noteText: `Pagamento da cobrança ${input.chargeId} confirmado com o pedido em ${orderStatus}; reembolsar pelo admin.`,
    })
    .returning({ supportTicketId: supportTicket.supportTicketId });
  if (!ticket) throw new Error("support_ticket insert returned no row");
  return { outcome: "duplicate_payment", supportTicketId: ticket.supportTicketId };
}

async function applyPaymentDecision(
  tx: Transaction,
  input: MarkOrderPaidInput,
  orderStatus: OrderStatus,
  decision: PaymentConfirmationDecision,
): Promise<MarkOrderPaidOutcome> {
  switch (decision.kind) {
    case "paid":
      return confirmPayment(tx, input, decision.nextOrderStatus);
    case "duplicate_payment":
      return recordDuplicatePayment(tx, input, orderStatus);
    case "already_paid":
      return { outcome: "already_paid" };
  }
}

export async function markOrderPaidAndEnqueue(
  tx: Transaction,
  input: MarkOrderPaidInput,
  { now = new Date() }: MarkOrderPaidOptions = {},
): Promise<Result<MarkOrderPaidOutcome, MarkOrderPaidError>> {
  const parsedInput = markOrderPaidInputSchema.parse(input);
  const target = await lockPaymentTarget(tx, parsedInput);
  if (!target.ok) return target;
  const { orderStatus, lockedCharge } = target.value;
  const decision = decidePaymentConfirmation(orderStatus, lockedCharge, {
    gatewayPaymentId: parsedInput.gatewayPaymentId,
    amountCents: parsedInput.amountCents,
  });
  if (!decision.ok) return decision;
  const outcome = await applyPaymentDecision(tx, parsedInput, orderStatus, decision.value);
  if (parsedInput.webhookEventId !== undefined) {
    await tx
      .update(webhookEvent)
      .set({ processedDatetime: now, outcomeCode: outcome.outcome })
      .where(eq(webhookEvent.webhookEventId, parsedInput.webhookEventId));
  }
  return ok(outcome);
}

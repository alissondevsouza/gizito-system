import {
  type ApiErrorCode,
  err,
  ok,
  type PaymentGateway,
  type Result,
  type WebhookAck,
  type WebhookRequest,
  type WebhookSource,
} from "@gizito/core";
import {
  type Database,
  enqueueJob,
  findChargeByGatewayOrderId,
  recordWebhookEvent,
} from "@gizito/db";
import type { Logger } from "@gizito/integrations";

export const PAYMENT_WEBHOOK_SOURCE: WebhookSource = "mercadopago";
export const WEBHOOK_REJECTED_LOG_MESSAGE = "webhook recusado";
export const WEBHOOK_RECEIVED_LOG_MESSAGE = "webhook recebido";

export type WebhookServiceErrorCode = Extract<ApiErrorCode, "unauthorized" | "validation_error">;

export type WebhookServiceError = {
  readonly code: WebhookServiceErrorCode;
};

export type ChargeWebhookDependencies = {
  readonly db: Database;
  readonly logger: Logger;
  readonly paymentGateway: PaymentGateway;
  readonly now: () => Date;
};

type ReceivedWebhookLog = {
  readonly outcome: WebhookAck["outcome"];
  readonly orderId?: string;
  readonly chargeId?: string;
  readonly webhookEventId?: string;
  readonly errorCode?: string;
};

export async function receiveMercadoPagoWebhook(
  { db, logger, paymentGateway, now }: ChargeWebhookDependencies,
  request: WebhookRequest,
): Promise<Result<WebhookAck, WebhookServiceError>> {
  const startTime = performance.now();
  const durationMs = () => Math.round(performance.now() - startTime);
  const received = (entry: ReceivedWebhookLog) => {
    logger.info({ ...entry, durationMs: durationMs() }, WEBHOOK_RECEIVED_LOG_MESSAGE);
    return ok({ outcome: entry.outcome });
  };
  const parsed = await paymentGateway.parseWebhook(request);
  if (!parsed.valid) {
    if (parsed.reason === "unsupported_event") return received({ outcome: "ignored" });
    logger.warn(
      { errorCode: parsed.reason, durationMs: durationMs() },
      WEBHOOK_REJECTED_LOG_MESSAGE,
    );
    return err({
      code: parsed.reason === "invalid_signature" ? "unauthorized" : "validation_error",
    });
  }
  if (parsed.gatewayOrderId === null) {
    logger.warn({ errorCode: "malformed", durationMs: durationMs() }, WEBHOOK_REJECTED_LOG_MESSAGE);
    return err({ code: "validation_error" });
  }
  const charge = await findChargeByGatewayOrderId(db, {
    gateway: paymentGateway.name,
    gatewayOrderId: parsed.gatewayOrderId,
  });
  if (charge === null) {
    const recorded = await recordWebhookEvent(db, {
      source: PAYMENT_WEBHOOK_SOURCE,
      externalId: parsed.externalId,
      processed: { outcomeCode: "charge_not_found", now: now() },
    });
    if (recorded === null) return received({ outcome: "duplicate" });
    return received({
      outcome: "unknown_charge",
      webhookEventId: recorded.webhookEventId,
      errorCode: "charge_not_found",
    });
  }
  const queued = await db.transaction(async (tx) => {
    const recorded = await recordWebhookEvent(tx, {
      source: PAYMENT_WEBHOOK_SOURCE,
      externalId: parsed.externalId,
    });
    if (recorded === null) return null;
    await enqueueJob(tx, {
      name: "charge.reconcile",
      orderId: charge.orderId,
      chargeId: charge.chargeId,
      webhookEventId: recorded.webhookEventId,
    });
    return recorded.webhookEventId;
  });
  if (queued === null) {
    return received({ outcome: "duplicate", orderId: charge.orderId, chargeId: charge.chargeId });
  }
  return received({
    outcome: "queued",
    orderId: charge.orderId,
    chargeId: charge.chargeId,
    webhookEventId: queued,
  });
}

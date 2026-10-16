export class OrderNotFoundError extends Error {
  readonly code = "order_not_found";

  constructor(readonly orderId: string) {
    super(`Order ${orderId} not found`);
    this.name = "OrderNotFoundError";
  }
}

export class ChargeNotFoundError extends Error {
  readonly code = "charge_not_found";

  constructor(
    readonly chargeId: string,
    readonly orderId: string,
  ) {
    super(`Charge ${chargeId} not found for order ${orderId}`);
    this.name = "ChargeNotFoundError";
  }
}

export class GatewayPaymentInUseError extends Error {
  readonly code = "gateway_payment_in_use";

  constructor(
    readonly gatewayPaymentId: string,
    readonly otherChargeId: string,
  ) {
    super(`Gateway payment ${gatewayPaymentId} is already bound to charge ${otherChargeId}`);
    this.name = "GatewayPaymentInUseError";
  }
}

export class WebhookEventNotFoundError extends Error {
  readonly code = "webhook_event_not_found";

  constructor(readonly webhookEventId: string) {
    super(`Webhook event ${webhookEventId} not found`);
    this.name = "WebhookEventNotFoundError";
  }
}

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

export class WebhookEventNotFoundError extends Error {
  readonly code = "webhook_event_not_found";

  constructor(readonly webhookEventId: string) {
    super(`Webhook event ${webhookEventId} not found`);
    this.name = "WebhookEventNotFoundError";
  }
}

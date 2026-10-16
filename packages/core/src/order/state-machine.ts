import { z } from "zod";
import { type OrderStatus, orderStatusList } from "#src/enums.ts";
import { err, ok, type Result } from "#src/result.ts";

export const orderEventList = [
  "start_analysis",
  "analysis_succeeded",
  "analysis_failed",
  "confirm",
  "payment_confirmed",
  "generation_started",
  "kit_published",
  "generation_failed",
  "reprocess",
  "refund",
] as const;
export const orderEventSchema = z.enum(orderEventList);
export type OrderEvent = z.infer<typeof orderEventSchema>;

export type OrderTransition = {
  readonly from: OrderStatus;
  readonly event: OrderEvent;
  readonly to: OrderStatus;
};

export const orderTransitionList: readonly OrderTransition[] = [
  { from: "draft", event: "start_analysis", to: "analyzing" },
  { from: "analyzing", event: "analysis_succeeded", to: "preview_ready" },
  { from: "analyzing", event: "analysis_failed", to: "draft" },
  { from: "preview_ready", event: "confirm", to: "awaiting_payment" },
  { from: "awaiting_payment", event: "payment_confirmed", to: "paid" },
  { from: "paid", event: "generation_started", to: "processing" },
  { from: "processing", event: "kit_published", to: "ready" },
  { from: "processing", event: "generation_failed", to: "failed" },
  { from: "failed", event: "reprocess", to: "paid" },
  { from: "paid", event: "refund", to: "refunded" },
  { from: "processing", event: "refund", to: "refunded" },
  { from: "ready", event: "refund", to: "refunded" },
  { from: "failed", event: "refund", to: "refunded" },
];

export class InvalidTransitionError extends Error {
  readonly code = "invalid_transition";

  constructor(
    readonly from: OrderStatus,
    readonly event: OrderEvent,
  ) {
    super(`Invalid order transition: status "${from}" does not accept event "${event}"`);
    this.name = "InvalidTransitionError";
  }
}

export function transitionOrder(
  status: OrderStatus,
  event: OrderEvent,
): Result<OrderStatus, InvalidTransitionError> {
  const transition = orderTransitionList.find((t) => t.from === status && t.event === event);
  return transition ? ok(transition.to) : err(new InvalidTransitionError(status, event));
}

export function allowedEventList(status: OrderStatus): readonly OrderEvent[] {
  return orderTransitionList.filter((t) => t.from === status).map((t) => t.event);
}

function collectReachableStatusList(start: OrderStatus): readonly OrderStatus[] {
  const reachedList: OrderStatus[] = [start];
  for (let index = 0; index < reachedList.length; index++) {
    for (const transition of orderTransitionList) {
      if (transition.from === reachedList[index] && !reachedList.includes(transition.to)) {
        reachedList.push(transition.to);
      }
    }
  }
  return orderStatusList.filter((status) => reachedList.includes(status));
}

export const postPaymentOrderStatusList: readonly OrderStatus[] =
  collectReachableStatusList("paid");

export function isPostPaymentOrderStatus(status: OrderStatus): boolean {
  return postPaymentOrderStatusList.includes(status);
}

export const terminalOrderStatusList: readonly OrderStatus[] = orderStatusList.filter(
  (status) => allowedEventList(status).length === 0,
);

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return terminalOrderStatusList.includes(status);
}

export const whatsappLinkableOrderStatusList: readonly OrderStatus[] = [
  "paid",
  "processing",
  "ready",
];

export function isWhatsappLinkableOrderStatus(status: OrderStatus): boolean {
  return whatsappLinkableOrderStatusList.includes(status);
}

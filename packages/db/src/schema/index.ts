import { aiCall } from "#src/schema/ai-call.ts";
import { charge } from "#src/schema/charge.ts";
import { job } from "#src/schema/job.ts";
import { kit } from "#src/schema/kit.ts";
import { notification } from "#src/schema/notification.ts";
import { order } from "#src/schema/order.ts";
import { orderPhoto } from "#src/schema/order-photo.ts";
import { supportTicket } from "#src/schema/support-ticket.ts";
import { webhookEvent } from "#src/schema/webhook-event.ts";

export * from "#src/schema/ai-call.ts";
export * from "#src/schema/charge.ts";
export * from "#src/schema/enums.ts";
export * from "#src/schema/job.ts";
export * from "#src/schema/kit.ts";
export * from "#src/schema/notification.ts";
export * from "#src/schema/order.ts";
export * from "#src/schema/order-photo.ts";
export * from "#src/schema/relations.ts";
export * from "#src/schema/support-ticket.ts";
export * from "#src/schema/webhook-event.ts";

export const tableList = [
  order,
  orderPhoto,
  charge,
  kit,
  aiCall,
  webhookEvent,
  notification,
  supportTicket,
  job,
] as const;

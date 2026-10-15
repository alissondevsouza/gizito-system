import { z } from "zod";
import { guidSchema, outcomeCodeSchema } from "#src/common.ts";
import {
  type NotificationChannelName,
  notificationChannelSchema,
  notificationKindSchema,
} from "#src/enums.ts";
import { emailSchema, phoneSchema, shortCodeSchema } from "#src/order/schemas.ts";

export const notificationAttachmentSchema = z.object({
  fileName: z.string().trim().min(1).max(100),
  url: z.url(),
});
export type NotificationAttachment = z.infer<typeof notificationAttachmentSchema>;

export const outboundNotificationSchema = z.object({
  orderId: guidSchema,
  kind: notificationKindSchema,
  channel: notificationChannelSchema,
  recipient: z.union([emailSchema, phoneSchema]),
  shortCode: shortCodeSchema,
  orderUrl: z.url().nullable(),
  textBody: z.string().max(4000).nullable(),
  attachmentList: z.array(notificationAttachmentSchema).max(2),
});
export type OutboundNotification = z.infer<typeof outboundNotificationSchema>;

export const sendResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("sent"), providerMessageId: z.string().min(1).nullable() }),
  z.object({ status: z.literal("failed"), errorCode: outcomeCodeSchema }),
  z.object({ status: z.literal("skipped"), reasonCode: outcomeCodeSchema }),
]);
export type SendResult = z.infer<typeof sendResultSchema>;

export interface NotificationChannel {
  readonly channel: NotificationChannelName;
  send(notification: OutboundNotification): Promise<SendResult>;
}

import { z } from "zod";
import { guidSchema, outcomeCodeSchema, webUrlSchema } from "#src/common.ts";
import {
  type NotificationChannelName,
  notificationChannelSchema,
  notificationKindSchema,
} from "#src/enums.ts";
import { emailSchema, phoneSchema, shortCodeSchema } from "#src/order/schemas.ts";

export const recipientHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export type RecipientHash = z.infer<typeof recipientHashSchema>;

export const notificationAttachmentSchema = z.object({
  fileName: z.string().trim().min(1).max(100),
  url: webUrlSchema,
});
export type NotificationAttachment = z.infer<typeof notificationAttachmentSchema>;

export const orderNotificationKindSchema = notificationKindSchema.exclude(["whatsapp_help"]);

const notificationBodyShape = {
  textBody: z.string().max(4000).nullable(),
  attachmentList: z.array(notificationAttachmentSchema).max(2),
};

export const outboundNotificationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: orderNotificationKindSchema,
    orderId: guidSchema,
    channel: notificationChannelSchema,
    recipient: z.union([emailSchema, phoneSchema]),
    shortCode: shortCodeSchema,
    orderUrl: webUrlSchema.nullable(),
    ...notificationBodyShape,
  }),
  z.strictObject({
    kind: z.literal("whatsapp_help"),
    channel: z.literal("whatsapp"),
    recipient: phoneSchema,
    ...notificationBodyShape,
  }),
]);
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

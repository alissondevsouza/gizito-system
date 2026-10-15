import { z } from "zod";
import { guidSchema } from "#src/common.ts";
import { MAX_WHATSAPP_INBOUND_TEXT_LENGTH } from "#src/constants.ts";
import { type JobName, notificationKindSchema } from "#src/enums.ts";
import { phoneSchema } from "#src/order/schemas.ts";

export const orderAnalyzeJobPayloadSchema = z.object({
  name: z.literal("order.analyze"),
  orderId: guidSchema,
});

export const orderGenerateJobPayloadSchema = z.object({
  name: z.literal("order.generate"),
  orderId: guidSchema,
});

export const orderNotifyJobPayloadSchema = z.object({
  name: z.literal("order.notify"),
  orderId: guidSchema,
  kind: notificationKindSchema,
});

export const chargeReconcileJobPayloadSchema = z.object({
  name: z.literal("charge.reconcile"),
  orderId: guidSchema.optional(),
});

export const retentionPurgeJobPayloadSchema = z.object({
  name: z.literal("retention.purge"),
});

export const whatsappInboundJobPayloadSchema = z.object({
  name: z.literal("whatsapp.inbound"),
  webhookEventId: guidSchema,
  phone: phoneSchema,
  text: z.string().min(1).max(MAX_WHATSAPP_INBOUND_TEXT_LENGTH),
});

export const jobPayloadSchema = z.discriminatedUnion("name", [
  orderAnalyzeJobPayloadSchema,
  orderGenerateJobPayloadSchema,
  orderNotifyJobPayloadSchema,
  chargeReconcileJobPayloadSchema,
  retentionPurgeJobPayloadSchema,
  whatsappInboundJobPayloadSchema,
]);
export type JobPayload = z.infer<typeof jobPayloadSchema>;
export type JobPayloadByName<N extends JobName> = Extract<JobPayload, { name: N }>;

export const jobPayloadSchemaByName = {
  "order.analyze": orderAnalyzeJobPayloadSchema,
  "order.generate": orderGenerateJobPayloadSchema,
  "order.notify": orderNotifyJobPayloadSchema,
  "charge.reconcile": chargeReconcileJobPayloadSchema,
  "retention.purge": retentionPurgeJobPayloadSchema,
  "whatsapp.inbound": whatsappInboundJobPayloadSchema,
} as const satisfies Record<JobName, z.ZodType>;

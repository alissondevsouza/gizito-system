import { z } from "zod";
import { guidSchema, webUrlSchema } from "#src/common.ts";
import { MAX_PHOTO_COUNT } from "#src/constants.ts";
import { gradeSchema, type OrderStatus, subjectSchema } from "#src/enums.ts";
import { photoIndexSchema } from "#src/order/photo.ts";
import { publicTokenSchema, shortCodeSchema } from "#src/order/schemas.ts";

export const photoStageOrderStatusList = [
  "draft",
  "analyzing",
  "preview_ready",
] as const satisfies readonly OrderStatus[];

export const postPhotoStageOrderStatusList = [
  "awaiting_payment",
  "paid",
  "processing",
  "ready",
  "failed",
  "refunded",
] as const satisfies readonly OrderStatus[];

export const photoReplaceableOrderStatusList = [
  "draft",
  "preview_ready",
] as const satisfies readonly OrderStatus[];

export function isPhotoReplaceableOrderStatus(status: OrderStatus): boolean {
  return photoReplaceableOrderStatusList.some((replaceable) => replaceable === status);
}

export const orderPhotoViewSchema = z.object({
  orderPhotoId: guidSchema,
  photoIndex: photoIndexSchema,
  thumbnailUrl: webUrlSchema,
  legibilityScore: z.number().min(0).max(1).nullable(),
});
export type OrderPhotoView = z.infer<typeof orderPhotoViewSchema>;

const orderViewBaseSchema = z.object({
  publicToken: publicTokenSchema,
  shortCode: shortCodeSchema,
  grade: gradeSchema,
  subject: subjectSchema,
  insertDatetime: z.iso.datetime(),
});

export const orderViewSchema = z.discriminatedUnion("status", [
  orderViewBaseSchema.extend({
    status: z.enum(photoStageOrderStatusList),
    photoList: z.array(orderPhotoViewSchema).max(MAX_PHOTO_COUNT),
  }),
  orderViewBaseSchema.extend({
    status: z.enum(postPhotoStageOrderStatusList),
  }),
]);
export type OrderView = z.infer<typeof orderViewSchema>;

export const createOrderResponseSchema = z.object({
  publicToken: publicTokenSchema,
  shortCode: shortCodeSchema,
  status: z.literal("draft"),
});
export type CreateOrderResponse = z.infer<typeof createOrderResponseSchema>;

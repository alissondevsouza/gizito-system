import { z } from "zod";
import { photoIndexSchema } from "#src/order/photo.ts";

export const apiErrorCodeList = [
  "invalid_token",
  "order_not_found",
  "invalid_state",
  "photo_too_large",
  "photo_invalid",
  "too_many_photos",
  "photo_duplicate",
  "payload_too_large",
  "charge_expired",
  "charge_active",
  "rate_limited",
  "challenge_required",
  "validation_error",
  "unauthorized",
  "not_found",
  "service_unavailable",
  "internal_error",
] as const;
export const apiErrorCodeSchema = z.enum(apiErrorCodeList);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorSchema = z.object({
  error: z.string().min(1),
  code: apiErrorCodeSchema,
  photoIndex: photoIndexSchema.optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

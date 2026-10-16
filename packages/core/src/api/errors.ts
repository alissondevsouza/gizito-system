import { z } from "zod";

export const apiErrorCodeList = [
  "invalid_token",
  "order_not_found",
  "invalid_state",
  "photo_too_large",
  "photo_invalid",
  "too_many_photos",
  "charge_expired",
  "charge_active",
  "rate_limited",
  "validation_error",
  "unauthorized",
  "not_found",
  "internal_error",
] as const;
export const apiErrorCodeSchema = z.enum(apiErrorCodeList);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorSchema = z.object({
  error: z.string().min(1),
  code: apiErrorCodeSchema,
});
export type ApiError = z.infer<typeof apiErrorSchema>;

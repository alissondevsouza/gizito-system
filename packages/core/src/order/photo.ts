import { z } from "zod";
import { guidSchema } from "#src/common.ts";
import { MAX_PHOTO_COUNT } from "#src/constants.ts";
import { gradeSchema, subjectSchema } from "#src/enums.ts";

export const photoIndexSchema = z
  .int()
  .min(0)
  .max(MAX_PHOTO_COUNT - 1);
export type PhotoIndex = z.infer<typeof photoIndexSchema>;

export const photoFormatList = ["jpeg", "png"] as const;
export const photoFormatSchema = z.enum(photoFormatList);
export type PhotoFormat = z.infer<typeof photoFormatSchema>;

const photoSignatureMap: Readonly<Record<PhotoFormat, readonly number[]>> = {
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

export const PHOTO_SIGNATURE_MAX_BYTES = Math.max(
  ...Object.values(photoSignatureMap).map((signature) => signature.length),
);

function startsWith(header: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => header[index] === byte);
}

export function detectPhotoFormat(header: Uint8Array): PhotoFormat | null {
  return photoFormatList.find((format) => startsWith(header, photoSignatureMap[format])) ?? null;
}

function repeatedFieldSchema<Item extends z.ZodType>(itemSchema: Item) {
  return z
    .union([itemSchema, z.array(itemSchema)])
    .transform((value): z.output<Item>[] => (Array.isArray(value) ? value : [value]));
}

export const photoFileListSchema = repeatedFieldSchema(z.instanceof(File));

export const createOrderInputSchema = z.object({
  grade: gradeSchema,
  subject: subjectSchema,
  photos: photoFileListSchema,
});
export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;

export const replaceOrderPhotoListInputSchema = z
  .object({
    orderPhotoId: repeatedFieldSchema(guidSchema),
    photos: photoFileListSchema,
  })
  .refine((input) => input.orderPhotoId.length === input.photos.length, {
    message: "each orderPhotoId needs exactly one photo",
    path: ["photos"],
  })
  .refine((input) => new Set(input.orderPhotoId).size === input.orderPhotoId.length, {
    message: "orderPhotoId must not repeat",
    path: ["orderPhotoId"],
  });
export type ReplaceOrderPhotoListInput = z.infer<typeof replaceOrderPhotoListInputSchema>;

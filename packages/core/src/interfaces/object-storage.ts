import { z } from "zod";
import { storageKeySchema } from "#src/storage/keys.ts";

export const storedContentTypeList = ["image/jpeg", "application/pdf"] as const;
export const storedContentTypeSchema = z.enum(storedContentTypeList);
export type StoredContentType = z.infer<typeof storedContentTypeSchema>;

export const putObjectInputSchema = z.object({
  key: storageKeySchema,
  body: z.instanceof(Uint8Array),
  contentType: storedContentTypeSchema,
});
export type PutObjectInput = z.infer<typeof putObjectInputSchema>;

export interface ObjectStorage {
  putPrivate(input: PutObjectInput): Promise<void>;
  getSignedUrl(key: string, ttlSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}

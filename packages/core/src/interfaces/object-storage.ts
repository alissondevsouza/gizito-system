import { z } from "zod";
import { MAX_SIGNED_URL_TTL_SECONDS } from "#src/constants.ts";
import { type StorageKey, storageKeySchema } from "#src/storage/keys.ts";

export const storedContentTypeList = ["image/jpeg", "application/pdf"] as const;
export const storedContentTypeSchema = z.enum(storedContentTypeList);
export type StoredContentType = z.infer<typeof storedContentTypeSchema>;

export const putObjectInputSchema = z.object({
  key: storageKeySchema,
  body: z.instanceof(Uint8Array),
  contentType: storedContentTypeSchema,
});
export type PutObjectInput = z.infer<typeof putObjectInputSchema>;

export const signedUrlTtlSecondsSchema = z.int().min(1).max(MAX_SIGNED_URL_TTL_SECONDS);

export const objectStorageErrorCodeList = [
  "storage_unavailable",
  "storage_rejected",
  "storage_not_found",
] as const;
export const objectStorageErrorCodeSchema = z.enum(objectStorageErrorCodeList);
export type ObjectStorageErrorCode = z.infer<typeof objectStorageErrorCodeSchema>;

export class ObjectStorageError extends Error {
  constructor(
    readonly code: ObjectStorageErrorCode,
    options?: { cause?: unknown },
  ) {
    super(`Object storage failed with ${code}`, options);
    this.name = "ObjectStorageError";
  }
}

export interface ObjectStorage {
  putPrivate(input: PutObjectInput): Promise<void>;
  get(key: StorageKey): Promise<Uint8Array>;
  getSignedUrl(key: StorageKey, ttlSeconds: number): Promise<string>;
  delete(key: StorageKey): Promise<void>;
}

import { z } from "zod";
import type { Guid } from "#src/common.ts";
import type { KitFileKind } from "#src/enums.ts";

const kitFileNameMap: Readonly<Record<KitFileKind, string>> = {
  activities: "activities.pdf",
  answer_key: "answer-key.pdf",
};

const PHOTO_THUMBNAIL_SUFFIX = "-thumbnail";

const LOWERCASE_GUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export const storageKeySchema = z
  .string()
  .regex(
    new RegExp(
      `^(photos/${LOWERCASE_GUID_PATTERN}/${LOWERCASE_GUID_PATTERN}(${PHOTO_THUMBNAIL_SUFFIX})?\\.jpg|orders/${LOWERCASE_GUID_PATTERN}/kits/${LOWERCASE_GUID_PATTERN}/(activities|answer-key)\\.pdf)$`,
    ),
  );
export type StorageKey = z.infer<typeof storageKeySchema>;

export function photoStorageKey(orderId: Guid, orderPhotoId: Guid): StorageKey {
  return `photos/${orderId.toLowerCase()}/${orderPhotoId.toLowerCase()}.jpg`;
}

export function photoThumbnailStorageKey(orderId: Guid, orderPhotoId: Guid): StorageKey {
  return `photos/${orderId.toLowerCase()}/${orderPhotoId.toLowerCase()}${PHOTO_THUMBNAIL_SUFFIX}.jpg`;
}

export function kitStorageKey(orderId: Guid, kitId: Guid, kind: KitFileKind): StorageKey {
  return `orders/${orderId.toLowerCase()}/kits/${kitId.toLowerCase()}/${kitFileNameMap[kind]}`;
}

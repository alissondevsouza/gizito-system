import { z } from "zod";
import type { Guid } from "#src/common.ts";
import type { KitFileKind } from "#src/enums.ts";

const kitFileNameMap: Readonly<Record<KitFileKind, string>> = {
  activities: "activities.pdf",
  answer_key: "answer-key.pdf",
};

const GUID_PATTERN = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

export const storageKeySchema = z
  .string()
  .regex(
    new RegExp(
      `^orders/${GUID_PATTERN}/(photos/${GUID_PATTERN}\\.jpg|kits/${GUID_PATTERN}/(activities|answer-key)\\.pdf)$`,
    ),
  );
export type StorageKey = z.infer<typeof storageKeySchema>;

export function photoStorageKey(orderId: Guid, orderPhotoId: Guid): StorageKey {
  return `orders/${orderId.toLowerCase()}/photos/${orderPhotoId.toLowerCase()}.jpg`;
}

export function kitStorageKey(orderId: Guid, kitId: Guid, kind: KitFileKind): StorageKey {
  return `orders/${orderId.toLowerCase()}/kits/${kitId.toLowerCase()}/${kitFileNameMap[kind]}`;
}

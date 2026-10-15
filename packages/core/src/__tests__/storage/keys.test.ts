import { describe, expect, it } from "bun:test";
import { KIT_ID, ORDER_ID, PHOTO_ID } from "#src/__tests__/__fixtures__/entities.ts";
import { kitStorageKey, photoStorageKey, storageKeySchema } from "#src/storage/keys.ts";

describe("keys do storage (rule integrations.md)", () => {
  it("segue o layout orders/{orderId}/...", () => {
    expect(photoStorageKey(ORDER_ID, PHOTO_ID)).toBe(`orders/${ORDER_ID}/photos/${PHOTO_ID}.jpg`);
    expect(kitStorageKey(ORDER_ID, KIT_ID, "activities")).toBe(
      `orders/${ORDER_ID}/kits/${KIT_ID}/activities.pdf`,
    );
    expect(kitStorageKey(ORDER_ID, KIT_ID, "answer_key")).toBe(
      `orders/${ORDER_ID}/kits/${KIT_ID}/answer-key.pdf`,
    );
  });

  it("storageKeySchema aceita as keys geradas e rejeita caminhos fora do layout", () => {
    expect(storageKeySchema.safeParse(photoStorageKey(ORDER_ID, PHOTO_ID)).success).toBe(true);
    expect(storageKeySchema.safeParse(kitStorageKey(ORDER_ID, KIT_ID, "activities")).success).toBe(
      true,
    );
    for (const key of [
      "orders/../etc/passwd",
      `orders/${ORDER_ID}/photos/${PHOTO_ID}.png`,
      `orders/${ORDER_ID}/kits/${KIT_ID}/kit.pdf`,
      `photos/${PHOTO_ID}.jpg`,
      `orders/${ORDER_ID}/photos/${PHOTO_ID}.jpg/extra`,
    ]) {
      expect(storageKeySchema.safeParse(key).success).toBe(false);
    }
  });
});

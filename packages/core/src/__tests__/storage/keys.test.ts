import { describe, expect, it } from "bun:test";
import { KIT_ID, ORDER_ID, PHOTO_ID } from "#src/__tests__/__fixtures__/entities.ts";
import {
  kitStorageKey,
  photoStorageKey,
  photoThumbnailStorageKey,
  storageKeySchema,
} from "#src/storage/keys.ts";

const LETTER_ORDER_ID = "abcdef12-3456-4789-8abc-def123456789";

describe("keys do storage (rule integrations.md)", () => {
  it("fotos em photos/{orderId}/..., PDFs em orders/{orderId}/kits/...", () => {
    expect(photoStorageKey(ORDER_ID, PHOTO_ID)).toBe(`photos/${ORDER_ID}/${PHOTO_ID}.jpg`);
    expect(kitStorageKey(ORDER_ID, KIT_ID, "activities")).toBe(
      `orders/${ORDER_ID}/kits/${KIT_ID}/activities.pdf`,
    );
    expect(kitStorageKey(ORDER_ID, KIT_ID, "answer_key")).toBe(
      `orders/${ORDER_ID}/kits/${KIT_ID}/answer-key.pdf`,
    );
  });

  it("uuid em maiúsculas (aceito por guidSchema) vira key canônica em minúsculas", () => {
    expect(photoStorageKey(LETTER_ORDER_ID.toUpperCase(), PHOTO_ID)).toBe(
      photoStorageKey(LETTER_ORDER_ID, PHOTO_ID),
    );
    expect(photoThumbnailStorageKey(LETTER_ORDER_ID.toUpperCase(), PHOTO_ID)).toBe(
      photoThumbnailStorageKey(LETTER_ORDER_ID, PHOTO_ID),
    );
  });

  it("storageKeySchema recusa GUID em maiúsculas (known-issue da F0, resolvido na F2-01)", () => {
    expect(
      storageKeySchema.safeParse(`photos/${LETTER_ORDER_ID.toUpperCase()}/${PHOTO_ID}.jpg`).success,
    ).toBe(false);
    expect(storageKeySchema.safeParse(photoStorageKey(LETTER_ORDER_ID, PHOTO_ID)).success).toBe(
      true,
    );
  });

  it("a miniatura fica ao lado da foto, com o sufixo -thumbnail", () => {
    const key = photoThumbnailStorageKey(ORDER_ID, PHOTO_ID);
    expect(key).toBe(`photos/${ORDER_ID}/${PHOTO_ID}-thumbnail.jpg`);
    expect(storageKeySchema.safeParse(key).success).toBe(true);
    expect(storageKeySchema.safeParse(`photos/${ORDER_ID}/${PHOTO_ID}-preview.jpg`).success).toBe(
      false,
    );
  });

  it("storageKeySchema aceita as keys geradas e rejeita caminhos fora do layout", () => {
    expect(storageKeySchema.safeParse(photoStorageKey(ORDER_ID, PHOTO_ID)).success).toBe(true);
    expect(storageKeySchema.safeParse(kitStorageKey(ORDER_ID, KIT_ID, "activities")).success).toBe(
      true,
    );
    for (const key of [
      "orders/../etc/passwd",
      `photos/${ORDER_ID}/${PHOTO_ID}.png`,
      `orders/${ORDER_ID}/photos/${PHOTO_ID}.jpg`,
      `photos/${ORDER_ID}/${PHOTO_ID}.pdf`,
      `orders/${ORDER_ID}/kits/${KIT_ID}/kit.pdf`,
      `photos/${PHOTO_ID}.jpg`,
      `orders/${ORDER_ID}/photos/${PHOTO_ID}.jpg/extra`,
    ]) {
      expect(storageKeySchema.safeParse(key).success).toBe(false);
    }
  });
});

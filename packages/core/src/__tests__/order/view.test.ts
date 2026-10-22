import { describe, expect, it } from "bun:test";
import {
  ORDER_ID,
  PHOTO_ID,
  PUBLIC_TOKEN,
  SHORT_CODE,
} from "#src/__tests__/__fixtures__/entities.ts";
import { MAX_PHOTO_COUNT } from "#src/constants.ts";
import { orderStatusList } from "#src/enums.ts";
import {
  createOrderResponseSchema,
  isPhotoReplaceableOrderStatus,
  orderViewSchema,
  photoStageOrderStatusList,
  postPhotoStageOrderStatusList,
} from "#src/order/view.ts";

const baseView = {
  publicToken: PUBLIC_TOKEN,
  shortCode: SHORT_CODE,
  grade: "5",
  subject: "math",
  insertDatetime: "2026-10-21T12:00:00.000Z",
} as const;

const photoView = {
  orderPhotoId: PHOTO_ID,
  photoIndex: 0,
  thumbnailUrl: `https://storage.example/photos/${ORDER_ID}/${PHOTO_ID}-thumbnail.jpg?X-Amz-Signature=abc`,
  legibilityScore: null,
};

describe("orderViewSchema (api.md §3)", () => {
  it("as duas listas de status particionam orderStatusList", () => {
    expect([...photoStageOrderStatusList, ...postPhotoStageOrderStatusList].sort()).toEqual(
      [...orderStatusList].sort(),
    );
  });

  it("draft, analyzing e preview_ready trazem photoList, vazia se as fotos já expiraram", () => {
    for (const status of photoStageOrderStatusList) {
      expect(
        orderViewSchema.safeParse({ ...baseView, status, photoList: [photoView] }).success,
      ).toBe(true);
      expect(orderViewSchema.safeParse({ ...baseView, status, photoList: [] }).success).toBe(true);
      expect(orderViewSchema.safeParse({ ...baseView, status }).success).toBe(false);
      expect(
        orderViewSchema.safeParse({
          ...baseView,
          status,
          photoList: Array.from({ length: MAX_PHOTO_COUNT + 1 }, () => photoView),
        }).success,
      ).toBe(false);
    }
  });

  it("depois da prévia, só os campos base", () => {
    for (const status of postPhotoStageOrderStatusList) {
      expect(orderViewSchema.safeParse({ ...baseView, status }).success).toBe(true);
    }
  });

  it("recusa token, data ou miniatura fora do formato", () => {
    const draft = { ...baseView, status: "draft", photoList: [photoView] };
    expect(orderViewSchema.safeParse({ ...draft, publicToken: "curto" }).success).toBe(false);
    expect(orderViewSchema.safeParse({ ...draft, insertDatetime: "ontem" }).success).toBe(false);
    expect(
      orderViewSchema.safeParse({
        ...draft,
        photoList: [{ ...photoView, thumbnailUrl: "ftp://x" }],
      }).success,
    ).toBe(false);
  });
});

describe("createOrderResponseSchema", () => {
  it("o pedido nasce em draft", () => {
    const created = { publicToken: PUBLIC_TOKEN, shortCode: SHORT_CODE, status: "draft" };
    expect(createOrderResponseSchema.safeParse(created).success).toBe(true);
    expect(createOrderResponseSchema.safeParse({ ...created, status: "analyzing" }).success).toBe(
      false,
    );
  });
});

describe("isPhotoReplaceableOrderStatus (design doc §6.3, Trocar foto)", () => {
  it("aceita só draft e preview_ready", () => {
    const replaceableList = orderStatusList.filter(isPhotoReplaceableOrderStatus);
    expect(replaceableList).toEqual(["draft", "preview_ready"]);
  });
});

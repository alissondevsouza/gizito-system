import { describe, expect, it } from "bun:test";
import { MAX_PHOTO_COUNT } from "#src/constants.ts";
import {
  createOrderInputSchema,
  detectPhotoFormat,
  PHOTO_SIGNATURE_MAX_BYTES,
  photoIndexSchema,
  replaceOrderPhotoListInputSchema,
} from "#src/order/photo.ts";

const bytesOf = (...byteList: number[]) => new Uint8Array(byteList);
const asciiBytes = (text: string) => new TextEncoder().encode(text);

describe("detectPhotoFormat (PRD §6: JPG ou PNG, pelo conteúdo)", () => {
  it("reconhece JPEG e PNG pelos bytes iniciais", () => {
    expect(detectPhotoFormat(bytesOf(0xff, 0xd8, 0xff, 0xe0, 0x00))).toBe("jpeg");
    expect(detectPhotoFormat(bytesOf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00))).toBe(
      "png",
    );
  });

  it("recusa HEIC, WebP, GIF, SVG, PDF e cabeçalho curto", () => {
    const heic = new Uint8Array([0, 0, 0, 0x18, ...asciiBytes("ftypheic")]);
    for (const header of [
      heic,
      asciiBytes("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "),
      asciiBytes("GIF89a"),
      asciiBytes('<svg xmlns="http://www.w3.org/2000/svg">'),
      asciiBytes("%PDF-1.7"),
      bytesOf(0xff, 0xd8),
      bytesOf(0x89, 0x50, 0x4e, 0x47),
      new Uint8Array(),
    ]) {
      expect(detectPhotoFormat(header)).toBeNull();
    }
  });

  it("basta ler PHOTO_SIGNATURE_MAX_BYTES para decidir", () => {
    expect(PHOTO_SIGNATURE_MAX_BYTES).toBe(8);
  });
});

describe("photoIndexSchema", () => {
  it("vai de 0 a MAX_PHOTO_COUNT - 1", () => {
    expect(photoIndexSchema.safeParse(0).success).toBe(true);
    expect(photoIndexSchema.safeParse(MAX_PHOTO_COUNT - 1).success).toBe(true);
    for (const index of [-1, MAX_PHOTO_COUNT, 1.5]) {
      expect(photoIndexSchema.safeParse(index).success).toBe(false);
    }
  });
});

const jpegFile = (name: string) => new File([new Uint8Array([0xff, 0xd8, 0xff])], name);
const ORDER_PHOTO_ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORDER_PHOTO_ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("createOrderInputSchema (multipart do POST /orders)", () => {
  it("normaliza um arquivo só ou vários para lista", () => {
    const single = createOrderInputSchema.parse({
      grade: "5",
      subject: "math",
      photos: jpegFile("a.jpg"),
    });
    expect(single.photos).toHaveLength(1);
    const many = createOrderInputSchema.parse({
      grade: "7",
      subject: "portuguese",
      photos: [jpegFile("a.jpg"), jpegFile("b.jpg")],
    });
    expect(many.photos.map((photo) => photo.name)).toEqual(["a.jpg", "b.jpg"]);
  });

  it("recusa ano, disciplina ou fotos ausentes e texto no lugar do arquivo", () => {
    for (const input of [
      { subject: "math", photos: jpegFile("a.jpg") },
      { grade: "8", subject: "math", photos: jpegFile("a.jpg") },
      { grade: "5", subject: "science", photos: jpegFile("a.jpg") },
      { grade: "5", subject: "math" },
      { grade: "5", subject: "math", photos: "não é arquivo" },
    ]) {
      expect(createOrderInputSchema.safeParse(input).success).toBe(false);
    }
  });
});

describe("replaceOrderPhotoListInputSchema (multipart do PUT /orders/:token/photos)", () => {
  it("pareia cada orderPhotoId com uma foto", () => {
    const single = replaceOrderPhotoListInputSchema.parse({
      orderPhotoId: ORDER_PHOTO_ID_A,
      photos: jpegFile("a.jpg"),
    });
    expect(single.orderPhotoId).toEqual([ORDER_PHOTO_ID_A]);
    const pair = replaceOrderPhotoListInputSchema.parse({
      orderPhotoId: [ORDER_PHOTO_ID_A, ORDER_PHOTO_ID_B],
      photos: [jpegFile("a.jpg"), jpegFile("b.jpg")],
    });
    expect(pair.photos).toHaveLength(2);
  });

  it("recusa listas de tamanhos diferentes, id repetido e id fora do formato", () => {
    for (const input of [
      { orderPhotoId: [ORDER_PHOTO_ID_A, ORDER_PHOTO_ID_B], photos: jpegFile("a.jpg") },
      {
        orderPhotoId: [ORDER_PHOTO_ID_A, ORDER_PHOTO_ID_A],
        photos: [jpegFile("a"), jpegFile("b")],
      },
      { orderPhotoId: "1", photos: jpegFile("a.jpg") },
      { photos: jpegFile("a.jpg") },
    ]) {
      expect(replaceOrderPhotoListInputSchema.safeParse(input).success).toBe(false);
    }
  });
});

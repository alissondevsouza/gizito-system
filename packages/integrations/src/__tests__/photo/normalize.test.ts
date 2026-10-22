import { describe, expect, it } from "bun:test";
import { AI_IMAGE_MAX_SIDE_PX, PHOTO_THUMBNAIL_MAX_SIDE_PX } from "@gizito/core";
import sharp from "sharp";
import { computeContentHash } from "#src/photo/content-hash.ts";
import { createPhotoNormalizer } from "#src/photo/normalize.ts";

const normalizePhoto = createPhotoNormalizer();

async function syntheticJpegWithExif(width: number, height: number): Promise<Uint8Array> {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: { r: 230, g: 240, b: 255 } },
  })
    .jpeg()
    .withExif({
      IFD0: { Make: "Camera sintética", Model: "Teste" },
      IFD3: { GPSLatitudeRef: "S", GPSLongitudeRef: "W" },
    })
    .withMetadata({ orientation: 6 })
    .toBuffer();
  return Uint8Array.from(buffer);
}

async function syntheticPng(width: number, height: number): Promise<Uint8Array> {
  const buffer = await sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .withMetadata()
    .withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF/></x:xmpmeta>')
    .toBuffer();
  return Uint8Array.from(buffer);
}

const asciiBytes = (text: string) => new TextEncoder().encode(text);

describe("normalizePhoto (spec F2-01, RF-01)", () => {
  it("gira pela orientação, reduz a 1600 px e tira EXIF, GPS e ICC", async () => {
    const input = await syntheticJpegWithExif(3000, 2000);
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const result = await normalizePhoto(input);
    if (!result.ok) throw new Error("normalização falhou");
    const metadata = await sharp(result.value.data).metadata();
    expect([metadata.format, metadata.width, metadata.height]).toEqual([
      "jpeg",
      Math.round((2000 / 3000) * AI_IMAGE_MAX_SIDE_PX),
      AI_IMAGE_MAX_SIDE_PX,
    ]);
    expect([result.value.width, result.value.height]).toEqual([metadata.width, metadata.height]);
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
  });

  it("PNG com transparência e XMP sai JPEG achatado e sem metadado", async () => {
    const result = await normalizePhoto(await syntheticPng(800, 600));
    if (!result.ok) throw new Error("normalização falhou");
    const metadata = await sharp(result.value.data).metadata();
    expect([metadata.format, metadata.width, metadata.height, metadata.hasAlpha]).toEqual([
      "jpeg",
      800,
      600,
      false,
    ]);
    expect(metadata.xmp).toBeUndefined();
    const { data } = await sharp(result.value.data).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(240);
  });

  it("não amplia imagem pequena e gera miniatura de até 400 px", async () => {
    const result = await normalizePhoto(await syntheticJpegWithExif(300, 200));
    if (!result.ok) throw new Error("normalização falhou");
    expect([result.value.width, result.value.height]).toEqual([200, 300]);
    const large = await normalizePhoto(await syntheticJpegWithExif(3000, 2000));
    if (!large.ok) throw new Error("normalização falhou");
    const thumbnail = await sharp(large.value.thumbnailData).metadata();
    expect(Math.max(thumbnail.width ?? 0, thumbnail.height ?? 0)).toBe(PHOTO_THUMBNAIL_MAX_SIDE_PX);
    expect(thumbnail.format).toBe("jpeg");
    expect(thumbnail.exif).toBeUndefined();
  });

  it("hash é o SHA-256 da foto normalizada e é estável para a mesma entrada", async () => {
    const input = await syntheticJpegWithExif(1200, 900);
    const first = await normalizePhoto(input);
    const second = await normalizePhoto(input);
    if (!first.ok || !second.ok) throw new Error("normalização falhou");
    expect(first.value.contentHash).toBe(computeContentHash(first.value.data));
    expect(first.value.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(second.value.contentHash).toBe(first.value.contentHash);
  });

  it("recusa HEIC, WebP, GIF, SVG e PDF antes de decodificar", async () => {
    for (const bytes of [
      new Uint8Array([0, 0, 0, 0x18, ...asciiBytes("ftypheic"), 0, 0, 0, 0]),
      asciiBytes("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "),
      asciiBytes("GIF89a\u0001\u0000\u0001\u0000"),
      asciiBytes('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'),
      asciiBytes("%PDF-1.7\n"),
    ]) {
      expect(await normalizePhoto(bytes)).toEqual({ ok: false, error: "photo_invalid" });
    }
  });

  it("recusa JPEG truncado, lixo com cabeçalho válido e imagem acima do teto de pixels", async () => {
    const jpeg = await syntheticJpegWithExif(1200, 900);
    const truncated = jpeg.subarray(0, Math.floor(jpeg.length * 0.6));
    const garbage = new Uint8Array([0xff, 0xd8, 0xff, ...new Uint8Array(500).fill(7)]);
    const bomb = Uint8Array.from(
      await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#fff" } })
        .png()
        .toBuffer(),
    );
    const smallLimit = createPhotoNormalizer({ maxInputPixels: 1000 * 1000 });
    expect(await normalizePhoto(truncated)).toEqual({ ok: false, error: "photo_invalid" });
    expect(await normalizePhoto(garbage)).toEqual({ ok: false, error: "photo_invalid" });
    expect(await smallLimit(bomb)).toEqual({ ok: false, error: "photo_invalid" });
  });

  it("o limite de concorrência por processo passa pelo semáforo, que recusa limite inválido", () => {
    expect(() => createPhotoNormalizer({ concurrency: 0 })).toThrow(RangeError);
    expect(() => createPhotoNormalizer({ concurrency: 1 })).not.toThrow();
  });
});

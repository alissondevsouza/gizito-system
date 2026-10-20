import { describe, expect, it } from "bun:test";
import type { AiImage } from "@gizito/core";
import sharp from "sharp";
import { reduceImage } from "#src/ai/image.ts";

async function syntheticImage(
  width: number,
  height: number,
  format: "jpeg" | "png",
  orientation?: number,
): Promise<AiImage["data"]> {
  const image = sharp({
    create: { width, height, channels: 3, background: { r: 230, g: 240, b: 255 } },
  });
  const encoded = format === "jpeg" ? image.jpeg() : image.png();
  const withOrientation =
    orientation === undefined ? encoded : encoded.withMetadata({ orientation });
  return Uint8Array.from(await withOrientation.toBuffer());
}

describe("reduceImage (spec F1-05, RF-04)", () => {
  it("limita o lado maior a 1600 px em JPEG", async () => {
    const result = await reduceImage({
      mediaType: "image/jpeg",
      data: await syntheticImage(4000, 3000, "jpeg"),
    });
    if (!result.ok) throw new Error("redução falhou");
    const metadata = await sharp(result.value.data).metadata();
    expect([metadata.width, metadata.height, metadata.format]).toEqual([1600, 1200, "jpeg"]);
    expect(result.value.mediaType).toBe("image/jpeg");
  });

  it("não amplia imagem pequena e converte PNG em JPEG", async () => {
    const result = await reduceImage({
      mediaType: "image/png",
      data: await syntheticImage(800, 600, "png"),
    });
    if (!result.ok) throw new Error("redução falhou");
    const metadata = await sharp(result.value.data).metadata();
    expect([metadata.width, metadata.height, metadata.format]).toEqual([800, 600, "jpeg"]);
  });

  it("gira pela orientação do EXIF e tira todo metadado", async () => {
    const result = await reduceImage({
      mediaType: "image/jpeg",
      data: await syntheticImage(300, 200, "jpeg", 6),
    });
    if (!result.ok) throw new Error("redução falhou");
    const metadata = await sharp(result.value.data).metadata();
    expect([metadata.width, metadata.height]).toEqual([200, 300]);
    expect(metadata.exif).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
  });

  it("bytes que não são imagem dão ai_image_invalid", async () => {
    const result = await reduceImage({
      mediaType: "image/jpeg",
      data: new Uint8Array([1, 2, 3, 4]),
    });
    expect(result).toEqual({ ok: false, error: "ai_image_invalid" });
  });

  it("PNG transparente sai com fundo branco, não preto", async () => {
    const transparentPng = Uint8Array.from(
      await sharp({
        create: {
          width: 200,
          height: 200,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .png()
        .toBuffer(),
    );
    const result = await reduceImage({ mediaType: "image/png", data: transparentPng });
    if (!result.ok) throw new Error("redução falhou");
    const { channels } = await sharp(result.value.data).stats();
    expect(channels.every((channel) => channel.mean > 250)).toBe(true);
  });
});

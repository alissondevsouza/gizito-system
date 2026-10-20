import {
  AI_IMAGE_JPEG_QUALITY,
  AI_IMAGE_MAX_SIDE_PX,
  type AiImage,
  err,
  ok,
  type Result,
} from "@gizito/core";
import sharp from "sharp";

export async function reduceImage(image: AiImage): Promise<Result<AiImage, "ai_image_invalid">> {
  try {
    const buffer = await sharp(image.data)
      .rotate()
      .resize({
        width: AI_IMAGE_MAX_SIDE_PX,
        height: AI_IMAGE_MAX_SIDE_PX,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: AI_IMAGE_JPEG_QUALITY })
      .toBuffer();
    return ok({
      mediaType: "image/jpeg",
      data: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
    });
  } catch {
    return err("ai_image_invalid");
  }
}

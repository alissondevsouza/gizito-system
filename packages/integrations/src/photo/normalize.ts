import {
  AI_IMAGE_JPEG_QUALITY,
  AI_IMAGE_MAX_SIDE_PX,
  detectPhotoFormat,
  err,
  MAX_PHOTO_INPUT_PIXELS,
  ok,
  PHOTO_NORMALIZE_CONCURRENCY,
  PHOTO_SIGNATURE_MAX_BYTES,
  PHOTO_THUMBNAIL_JPEG_QUALITY,
  PHOTO_THUMBNAIL_MAX_SIDE_PX,
  type Result,
} from "@gizito/core";
import sharp from "sharp";
import { createSemaphore } from "#src/concurrency/semaphore.ts";
import { computeContentHash } from "#src/photo/content-hash.ts";

const JPEG_BACKGROUND_COLOR = "#ffffff";

export const PHOTO_INVALID_CODE = "photo_invalid";

export type NormalizedPhoto = {
  readonly data: Uint8Array<ArrayBuffer>;
  readonly thumbnailData: Uint8Array<ArrayBuffer>;
  readonly width: number;
  readonly height: number;
  readonly contentHash: string;
};

export type PhotoNormalizer = (
  bytes: Uint8Array,
) => Promise<Result<NormalizedPhoto, typeof PHOTO_INVALID_CODE>>;

export type PhotoNormalizerOptions = {
  readonly concurrency?: number;
  readonly maxInputPixels?: number;
};

function toUint8Array(buffer: Buffer): Uint8Array<ArrayBuffer> {
  return new Uint8Array(buffer);
}

async function encodeJpeg(
  input: Uint8Array,
  maxSidePx: number,
  quality: number,
  maxInputPixels: number,
) {
  return sharp(input, { failOn: "error", limitInputPixels: maxInputPixels })
    .rotate()
    .resize({ width: maxSidePx, height: maxSidePx, fit: "inside", withoutEnlargement: true })
    .flatten({ background: JPEG_BACKGROUND_COLOR })
    .jpeg({ quality })
    .toBuffer({ resolveWithObject: true });
}

export function createPhotoNormalizer({
  concurrency = PHOTO_NORMALIZE_CONCURRENCY,
  maxInputPixels = MAX_PHOTO_INPUT_PIXELS,
}: PhotoNormalizerOptions = {}): PhotoNormalizer {
  const semaphore = createSemaphore(concurrency);
  return async (bytes) => {
    if (detectPhotoFormat(bytes.subarray(0, PHOTO_SIGNATURE_MAX_BYTES)) === null) {
      return err(PHOTO_INVALID_CODE);
    }
    return semaphore.run(async () => {
      try {
        const photo = await encodeJpeg(
          bytes,
          AI_IMAGE_MAX_SIDE_PX,
          AI_IMAGE_JPEG_QUALITY,
          maxInputPixels,
        );
        const thumbnail = await encodeJpeg(
          toUint8Array(photo.data),
          PHOTO_THUMBNAIL_MAX_SIDE_PX,
          PHOTO_THUMBNAIL_JPEG_QUALITY,
          maxInputPixels,
        );
        const data = toUint8Array(photo.data);
        return ok({
          data,
          thumbnailData: toUint8Array(thumbnail.data),
          width: photo.info.width,
          height: photo.info.height,
          contentHash: computeContentHash(data),
        });
      } catch {
        return err(PHOTO_INVALID_CODE);
      }
    });
  };
}

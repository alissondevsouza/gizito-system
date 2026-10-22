import { randomBytes } from "node:crypto";
import type { Database } from "@gizito/db";
import { createPhotoNormalizer, type Logger } from "@gizito/integrations";
import { createFakeObjectStorage, type FakeObjectStorage } from "@gizito/integrations/fakes";
import sharp from "sharp";
import type { AppDependencies } from "#src/app.ts";

export const WEB_PUBLIC_URL = "http://localhost:3000";
export const CLIENT_HASH_SECRET = "segredo-de-teste-com-mais-de-32-caracteres";

export type TestAppDependencies = AppDependencies & { storage: FakeObjectStorage };

export function buildAppDependencies(
  db: Database,
  logger: Logger,
  overrides: Partial<TestAppDependencies> = {},
): TestAppDependencies {
  return {
    db,
    logger,
    webPublicUrl: WEB_PUBLIC_URL,
    storage: createFakeObjectStorage(),
    normalizePhoto: createPhotoNormalizer(),
    clientHashSecret: CLIENT_HASH_SECRET,
    trustedProxyHopCount: 1,
    isSecureCookie: false,
    randomBytes: (length) => new Uint8Array(randomBytes(length)),
    ...overrides,
  };
}

export async function syntheticJpeg(
  seed: number,
  { width = 120, height = 90, withExif = false } = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const image = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: (seed * 53) % 256, g: (seed * 97) % 256, b: (seed * 29) % 256 },
    },
  }).jpeg();
  const encoded = withExif
    ? image
        .withExif({ IFD0: { Make: "Camera sintética" }, IFD3: { GPSLatitudeRef: "S" } })
        .withMetadata({ orientation: 6 })
    : image;
  return new Uint8Array(await encoded.toBuffer());
}

export async function syntheticPng(seed: number): Promise<Uint8Array<ArrayBuffer>> {
  const buffer = await sharp({
    create: {
      width: 80,
      height: 60,
      channels: 4,
      background: { r: seed % 256, g: 10, b: 10, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
  return new Uint8Array(buffer);
}

export function photoFile(bytes: Uint8Array<ArrayBuffer>, name: string, type = "image/jpeg"): File {
  return new File([bytes], name, { type });
}

export function orderForm(
  photoList: readonly File[],
  { grade = "5", subject = "math" }: { grade?: string; subject?: string } = {},
): FormData {
  const form = new FormData();
  form.set("grade", grade);
  form.set("subject", subject);
  for (const photo of photoList) form.append("photos", photo);
  return form;
}

export function replaceForm(pairList: readonly (readonly [string, File])[]): FormData {
  const form = new FormData();
  for (const [orderPhotoId, photo] of pairList) {
    form.append("orderPhotoId", orderPhotoId);
    form.append("photos", photo);
  }
  return form;
}

import type { z } from "zod";
import {
  DEVICE_ID_BYTES,
  DEVICE_ID_LENGTH,
  PUBLIC_TOKEN_BYTES,
  SHORT_CODE_ALPHABET,
  SHORT_CODE_LENGTH,
  SHORT_CODE_PREFIX,
} from "#src/constants.ts";
import {
  base64Url32ByteSchema,
  type PublicToken,
  publicTokenSchema,
  type ShortCode,
} from "#src/order/schemas.ts";

const BYTE_VALUE_COUNT = 256;

export const deviceIdSchema = base64Url32ByteSchema(DEVICE_ID_LENGTH);
export type DeviceId = z.infer<typeof deviceIdSchema>;

function assertByteCount(randomByteList: Uint8Array, expectedCount: number): void {
  if (randomByteList.length !== expectedCount) {
    throw new RangeError(`expected ${expectedCount} random bytes, got ${randomByteList.length}`);
  }
}

function encodeBase64Url(byteList: Uint8Array): string {
  return btoa(String.fromCharCode(...byteList))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function buildPublicToken(randomByteList: Uint8Array): PublicToken {
  assertByteCount(randomByteList, PUBLIC_TOKEN_BYTES);
  return publicTokenSchema.parse(encodeBase64Url(randomByteList));
}

export function buildDeviceId(randomByteList: Uint8Array): DeviceId {
  assertByteCount(randomByteList, DEVICE_ID_BYTES);
  return deviceIdSchema.parse(encodeBase64Url(randomByteList));
}

export function buildShortCode(randomByteList: Uint8Array): ShortCode {
  assertByteCount(randomByteList, SHORT_CODE_LENGTH);
  if (BYTE_VALUE_COUNT % SHORT_CODE_ALPHABET.length !== 0) {
    throw new RangeError("SHORT_CODE_ALPHABET length must divide 256 for a uniform draw");
  }
  const letterList = Array.from(
    randomByteList,
    (byte) => SHORT_CODE_ALPHABET[byte % SHORT_CODE_ALPHABET.length],
  );
  return `${SHORT_CODE_PREFIX}${letterList.join("")}`;
}

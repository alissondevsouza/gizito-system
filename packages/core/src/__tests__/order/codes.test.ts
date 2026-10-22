import { describe, expect, it } from "bun:test";
import { randomBytes } from "node:crypto";
import {
  DEVICE_ID_BYTES,
  PUBLIC_TOKEN_BYTES,
  SHORT_CODE_ALPHABET,
  SHORT_CODE_LENGTH,
} from "#src/constants.ts";
import {
  buildDeviceId,
  buildPublicToken,
  buildShortCode,
  deviceIdSchema,
} from "#src/order/codes.ts";
import { publicTokenSchema, shortCodeSchema } from "#src/order/schemas.ts";

describe("buildPublicToken (api.md: 32 bytes em base64url)", () => {
  it("codifica como o base64url do Node e passa no publicTokenSchema", () => {
    for (let count = 0; count < 200; count++) {
      const byteList = new Uint8Array(randomBytes(PUBLIC_TOKEN_BYTES));
      const token = buildPublicToken(byteList);
      expect(token).toBe(Buffer.from(byteList).toString("base64url"));
      expect(publicTokenSchema.safeParse(token).success).toBe(true);
    }
  });

  it("recusa quantidade errada de bytes", () => {
    expect(() => buildPublicToken(new Uint8Array(PUBLIC_TOKEN_BYTES - 1))).toThrow(RangeError);
  });
});

describe("buildDeviceId", () => {
  it("gera id que passa no deviceIdSchema e recusa cookie forjado", () => {
    const deviceId = buildDeviceId(new Uint8Array(randomBytes(DEVICE_ID_BYTES)));
    expect(deviceIdSchema.safeParse(deviceId).success).toBe(true);
    for (const forged of ["", "abc", `${deviceId}x`, `${deviceId.slice(0, -1)}B`, "a".repeat(43)]) {
      expect(deviceIdSchema.safeParse(forged).success).toBe(false);
    }
  });
});

describe("buildShortCode (PRD §5: GZ- + 6 caracteres sem ambiguidade)", () => {
  it("usa só o alfabeto e passa no shortCodeSchema", () => {
    for (let count = 0; count < 200; count++) {
      const code = buildShortCode(new Uint8Array(randomBytes(SHORT_CODE_LENGTH)));
      expect(shortCodeSchema.safeParse(code).success).toBe(true);
    }
  });

  it("sorteio uniforme: cada byte cai numa letra, e cada letra recebe 256 / 32 bytes", () => {
    expect(256 % SHORT_CODE_ALPHABET.length).toBe(0);
    const hitMap = new Map<string, number>();
    for (let byte = 0; byte < 256; byte++) {
      const letter = buildShortCode(new Uint8Array(SHORT_CODE_LENGTH).fill(byte)).slice(-1);
      hitMap.set(letter, (hitMap.get(letter) ?? 0) + 1);
    }
    expect(hitMap.size).toBe(SHORT_CODE_ALPHABET.length);
    expect(new Set(hitMap.values())).toEqual(new Set([256 / SHORT_CODE_ALPHABET.length]));
  });

  it("recusa quantidade errada de bytes", () => {
    expect(() => buildShortCode(new Uint8Array(SHORT_CODE_LENGTH + 1))).toThrow(RangeError);
  });
});

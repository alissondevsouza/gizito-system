import { describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import { DEVICE_COOKIE_MAX_AGE_DAYS, DEVICE_ID_BYTES, deviceIdSchema } from "@gizito/core";
import { CLIENT_HASH_SECRET } from "#src/__tests__/__fixtures__/app.ts";
import {
  buildDeviceCookie,
  DEVICE_COOKIE_NAME,
  readDeviceId,
  resolveClientIdentity,
  resolveClientIp,
} from "#src/http/client-identity.ts";

const KNOWN_DEVICE_ID = "Ab3_-cdEfGhIjKlMnOpQrStUvWxYz0123456789abcQ";
const headersOf = (init: Record<string, string>) => new Headers(init);
const fixedBytes = (length: number) => new Uint8Array(length).fill(7);

describe("resolveClientIp (RF-06)", () => {
  it("sem proxy confiável, usa o endereço do socket e ignora X-Forwarded-For", () => {
    expect(
      resolveClientIp(headersOf({ "x-forwarded-for": "198.51.100.1" }), "203.0.113.9", 0),
    ).toBe("203.0.113.9");
  });

  it("com n proxies confiáveis, pega a n-ésima entrada pela direita", () => {
    const headers = headersOf({ "x-forwarded-for": "6.6.6.6, 203.0.113.7 , 10.0.0.2" });
    expect(resolveClientIp(headers, "10.0.0.3", 1)).toBe("10.0.0.2");
    expect(resolveClientIp(headers, "10.0.0.3", 2)).toBe("203.0.113.7");
    expect(resolveClientIp(headersOf({ "x-forwarded-for": "forjado, real" }), null, 1)).toBe(
      "real",
    );
  });

  it("com menos entradas que proxies, ou sem o cabeçalho, não há IP", () => {
    expect(
      resolveClientIp(headersOf({ "x-forwarded-for": "203.0.113.7" }), "10.0.0.3", 2),
    ).toBeNull();
    expect(resolveClientIp(headersOf({}), "10.0.0.3", 1)).toBeNull();
  });
});

describe("cookie do dispositivo", () => {
  it("lê só o cookie gizito_device com id válido", () => {
    expect(
      readDeviceId(headersOf({ cookie: `outro=1; ${DEVICE_COOKIE_NAME}=${KNOWN_DEVICE_ID}` })),
    ).toBe(KNOWN_DEVICE_ID);
    for (const cookie of [
      "",
      `${DEVICE_COOKIE_NAME}=forjado`,
      `x${DEVICE_COOKIE_NAME}=${KNOWN_DEVICE_ID}`,
      `${DEVICE_COOKIE_NAME}`,
    ]) {
      expect(readDeviceId(headersOf({ cookie }))).toBeNull();
    }
  });

  it("monta o cookie HttpOnly, SameSite=Lax e Secure só quando pedido", () => {
    const cookie = buildDeviceCookie(KNOWN_DEVICE_ID, false);
    expect(cookie).toBe(
      `${DEVICE_COOKIE_NAME}=${KNOWN_DEVICE_ID}; Path=/; Max-Age=${DEVICE_COOKIE_MAX_AGE_DAYS * 86400}; HttpOnly; SameSite=Lax`,
    );
    expect(buildDeviceCookie(KNOWN_DEVICE_ID, true).endsWith("; Secure")).toBe(true);
  });
});

describe("resolveClientIdentity", () => {
  const options = {
    clientHashSecret: CLIENT_HASH_SECRET,
    trustedProxyHopCount: 1,
    randomBytes: fixedBytes,
  };

  it("cria dispositivo novo quando o cookie falta e reaproveita o existente", () => {
    const fresh = resolveClientIdentity(
      headersOf({ "x-forwarded-for": "203.0.113.7" }),
      null,
      options,
    );
    expect(fresh.isNewDevice).toBe(true);
    expect(deviceIdSchema.safeParse(fresh.deviceId).success).toBe(true);
    expect(fresh.deviceId).toBe(Buffer.from(fixedBytes(DEVICE_ID_BYTES)).toString("base64url"));
    const known = resolveClientIdentity(
      headersOf({
        cookie: `${DEVICE_COOKIE_NAME}=${KNOWN_DEVICE_ID}`,
        "x-forwarded-for": "203.0.113.7",
      }),
      null,
      options,
    );
    expect([known.isNewDevice, known.deviceId]).toEqual([false, KNOWN_DEVICE_ID]);
  });

  it("guarda só HMAC com segredo, separado por tipo de chave e com o IPv6 em /64", () => {
    const identity = resolveClientIdentity(
      headersOf({
        cookie: `${DEVICE_COOKIE_NAME}=${KNOWN_DEVICE_ID}`,
        "x-forwarded-for": "2804:14c:1:2::99",
      }),
      null,
      options,
    );
    const hmac = (value: string) =>
      createHmac("sha256", CLIENT_HASH_SECRET).update(value).digest("hex");
    expect(identity.clientIpHash).toBe(hmac("ip:2804:14c:1:2::/64"));
    expect(identity.deviceHash).toBe(hmac(`device:${KNOWN_DEVICE_ID}`));
    expect(identity.clientIpHash).not.toContain("2804");
    const sameSubnet = resolveClientIdentity(
      headersOf({ "x-forwarded-for": "2804:14c:1:2:ffff::1" }),
      null,
      options,
    );
    expect(sameSubnet.clientIpHash).toBe(identity.clientIpHash);
  });

  it("sem IP determinável, usa a chave compartilhada de IP desconhecido", () => {
    const first = resolveClientIdentity(headersOf({}), null, options);
    const second = resolveClientIdentity(headersOf({ "x-forwarded-for": "lixo" }), null, options);
    expect(first.clientIpHash).toBe(second.clientIpHash);
  });
});

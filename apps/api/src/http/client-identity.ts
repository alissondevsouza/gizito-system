import { createHmac } from "node:crypto";
import {
  buildDeviceId,
  DEVICE_COOKIE_MAX_AGE_DAYS,
  DEVICE_ID_BYTES,
  type DeviceId,
  deviceIdSchema,
  normalizeClientIp,
} from "@gizito/core";
import type { ClientKeyHashMap } from "#src/services/preview-rate-limit.ts";

export const DEVICE_COOKIE_NAME = "gizito_device";

const SECONDS_PER_DAY = 24 * 60 * 60;

export type ClientIdentity = ClientKeyHashMap & {
  readonly deviceId: DeviceId;
  readonly isNewDevice: boolean;
};

export type ClientIdentityOptions = {
  readonly clientHashSecret: string;
  readonly trustedProxyHopCount: number;
  readonly randomBytes: (length: number) => Uint8Array;
};

export function resolveClientIp(
  headers: Headers,
  socketAddress: string | null,
  trustedProxyHopCount: number,
): string | null {
  if (trustedProxyHopCount === 0) return socketAddress;
  const forwardedList = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  return forwardedList[forwardedList.length - trustedProxyHopCount] ?? null;
}

export function readDeviceId(headers: Headers): DeviceId | null {
  for (const pair of (headers.get("cookie") ?? "").split(";")) {
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex === -1 || pair.slice(0, separatorIndex).trim() !== DEVICE_COOKIE_NAME) {
      continue;
    }
    const parsed = deviceIdSchema.safeParse(pair.slice(separatorIndex + 1).trim());
    if (parsed.success) return parsed.data;
  }
  return null;
}

export function buildDeviceCookie(deviceId: DeviceId, isSecure: boolean): string {
  const attributeList = [
    `${DEVICE_COOKIE_NAME}=${deviceId}`,
    "Path=/",
    `Max-Age=${DEVICE_COOKIE_MAX_AGE_DAYS * SECONDS_PER_DAY}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  return (isSecure ? [...attributeList, "Secure"] : attributeList).join("; ");
}

function hashClientKey(secret: string, kind: "ip" | "device", value: string): string {
  return createHmac("sha256", secret).update(`${kind}:${value}`).digest("hex");
}

export function resolveClientIdentity(
  headers: Headers,
  socketAddress: string | null,
  { clientHashSecret, trustedProxyHopCount, randomBytes }: ClientIdentityOptions,
): ClientIdentity {
  const knownDeviceId = readDeviceId(headers);
  const deviceId = knownDeviceId ?? buildDeviceId(randomBytes(DEVICE_ID_BYTES));
  const clientIp = normalizeClientIp(resolveClientIp(headers, socketAddress, trustedProxyHopCount));
  return {
    deviceId,
    isNewDevice: knownDeviceId === null,
    clientIpHash: hashClientKey(clientHashSecret, "ip", clientIp),
    deviceHash: hashClientKey(clientHashSecret, "device", deviceId),
  };
}

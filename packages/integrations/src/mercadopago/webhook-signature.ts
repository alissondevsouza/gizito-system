import { createHmac, timingSafeEqual } from "node:crypto";

export type SignatureHeader = {
  readonly ts: string | null;
  readonly v1: string | null;
};

export type SignatureManifestInput = {
  readonly dataId: string | null;
  readonly requestId: string | null;
  readonly ts: string | null;
};

export function parseSignatureHeader(header: string): SignatureHeader {
  const valueByKey = new Map<string, string>();
  for (const part of header.split(",")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex <= 0) continue;
    valueByKey.set(part.slice(0, separatorIndex).trim(), part.slice(separatorIndex + 1).trim());
  }
  return { ts: valueByKey.get("ts") || null, v1: valueByKey.get("v1") || null };
}

export function buildSignatureManifest({ dataId, requestId, ts }: SignatureManifestInput): string {
  const pairList: [string, string | null][] = [
    ["id", dataId === null ? null : dataId.toLowerCase()],
    ["request-id", requestId],
    ["ts", ts],
  ];
  return pairList
    .filter((pair): pair is [string, string] => pair[1] !== null && pair[1] !== "")
    .map(([key, value]) => `${key}:${value};`)
    .join("");
}

export function computeWebhookSignature(secret: string, manifest: string): string {
  return createHmac("sha256", secret).update(manifest).digest("hex");
}

export function isSameSignature(expected: string, received: string): boolean {
  const expectedBytes = Buffer.from(expected, "utf8");
  const receivedBytes = Buffer.from(received.toLowerCase(), "utf8");
  return (
    expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes)
  );
}

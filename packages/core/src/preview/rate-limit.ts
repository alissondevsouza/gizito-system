import { PREVIEW_RATE_LIMIT_PER_DAY, PREVIEW_RATE_LIMIT_PER_HOUR } from "#src/constants.ts";
import { type PreviewRateLimitKey, previewRateLimitKeyList } from "#src/enums.ts";

export const UNKNOWN_CLIENT_IP = "unknown";

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV4_MAX_OCTET = 255;
const IPV6_HEXTET_COUNT = 8;
const IPV6_HEXTET_PATTERN = /^[0-9a-f]{1,4}$/;
const IPV6_PREFIX_HEXTET_COUNT = 4;
const IPV4_MAPPED_MARKER = 0xffff;
const IPV4_MAPPED_ZERO_HEXTET_COUNT = 5;
const BYTE_SHIFT = 8;
const BYTE_MASK = 0xff;

function parseIpv4(address: string): number[] | null {
  const match = IPV4_PATTERN.exec(address);
  if (match === null) return null;
  const octetList = match.slice(1).map(Number);
  return octetList.every((octet) => octet <= IPV4_MAX_OCTET) ? octetList : null;
}

function parseHextetList(partList: readonly string[], endsAddress: boolean): number[] | null {
  const hextetList: number[] = [];
  for (const [index, part] of partList.entries()) {
    const ipv4 = endsAddress && index === partList.length - 1 ? parseIpv4(part) : null;
    if (ipv4 !== null) {
      const [first = 0, second = 0, third = 0, fourth = 0] = ipv4;
      hextetList.push((first << BYTE_SHIFT) | second, (third << BYTE_SHIFT) | fourth);
    } else if (IPV6_HEXTET_PATTERN.test(part)) {
      hextetList.push(Number.parseInt(part, 16));
    } else {
      return null;
    }
  }
  return hextetList;
}

function parseIpv6(address: string): number[] | null {
  const [head, tail, ...rest] = address.toLowerCase().split("%")[0]?.split("::") ?? [];
  if (head === undefined || rest.length > 0) return null;
  const headList = head === "" ? [] : parseHextetList(head.split(":"), tail === undefined);
  const tailList = tail === undefined || tail === "" ? [] : parseHextetList(tail.split(":"), true);
  if (headList === null || tailList === null) return null;
  const missingCount = IPV6_HEXTET_COUNT - headList.length - tailList.length;
  if (tail === undefined ? missingCount !== 0 : missingCount < 1) return null;
  return [...headList, ...Array<number>(missingCount).fill(0), ...tailList];
}

function isIpv4Mapped(hextetList: readonly number[]): boolean {
  return (
    hextetList.slice(0, IPV4_MAPPED_ZERO_HEXTET_COUNT).every((hextet) => hextet === 0) &&
    hextetList[IPV4_MAPPED_ZERO_HEXTET_COUNT] === IPV4_MAPPED_MARKER
  );
}

export function normalizeClientIp(address: string | null): string {
  const trimmed = address?.trim() ?? "";
  const ipv4 = parseIpv4(trimmed);
  if (ipv4 !== null) return ipv4.join(".");
  const hextetList = parseIpv6(trimmed);
  if (hextetList === null) return UNKNOWN_CLIENT_IP;
  if (isIpv4Mapped(hextetList)) {
    const high = hextetList[6] ?? 0;
    const low = hextetList[7] ?? 0;
    return [high >> BYTE_SHIFT, high & BYTE_MASK, low >> BYTE_SHIFT, low & BYTE_MASK].join(".");
  }
  const prefix = hextetList
    .slice(0, IPV6_PREFIX_HEXTET_COUNT)
    .map((hextet) => hextet.toString(16))
    .join(":");
  return `${prefix}::/64`;
}

export const previewRateLimitWindowList = ["hour", "day"] as const;
export type PreviewRateLimitWindow = (typeof previewRateLimitWindowList)[number];

export type PreviewRequestCountMap = Readonly<
  Record<PreviewRateLimitKey, Readonly<Record<PreviewRateLimitWindow, number>>>
>;

export type ExceededPreviewLimit = {
  readonly key: PreviewRateLimitKey;
  readonly window: PreviewRateLimitWindow;
};

const previewRateLimitByWindow: Readonly<
  Record<PreviewRateLimitWindow, Readonly<Record<PreviewRateLimitKey, number>>>
> = {
  hour: PREVIEW_RATE_LIMIT_PER_HOUR,
  day: PREVIEW_RATE_LIMIT_PER_DAY,
};

export function findExceededPreviewLimit(
  countMap: PreviewRequestCountMap,
): ExceededPreviewLimit | null {
  for (const key of previewRateLimitKeyList) {
    for (const window of previewRateLimitWindowList) {
      if (countMap[key][window] >= previewRateLimitByWindow[window][key]) return { key, window };
    }
  }
  return null;
}

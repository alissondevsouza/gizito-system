import { describe, expect, it } from "bun:test";
import { PREVIEW_RATE_LIMIT_PER_DAY, PREVIEW_RATE_LIMIT_PER_HOUR } from "#src/constants.ts";
import {
  findExceededPreviewLimit,
  normalizeClientIp,
  type PreviewRequestCountMap,
  UNKNOWN_CLIENT_IP,
} from "#src/preview/rate-limit.ts";

describe("normalizeClientIp (chave de IP do rate limit)", () => {
  it("IPv4 fica como está", () => {
    expect(normalizeClientIp("203.0.113.7")).toBe("203.0.113.7");
    expect(normalizeClientIp(" 198.51.100.20 ")).toBe("198.51.100.20");
  });

  it("IPv4 mapeado em IPv6 vira IPv4", () => {
    expect(normalizeClientIp("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(normalizeClientIp("::ffff:cb00:7107")).toBe("203.0.113.7");
    expect(normalizeClientIp("0:0:0:0:0:ffff:203.0.113.7")).toBe("203.0.113.7");
  });

  it("IPv6 vira o prefixo /64, com e sem compressão", () => {
    expect(normalizeClientIp("2001:db8:85a3:8d3:1319:8a2e:370:7348")).toBe(
      "2001:db8:85a3:8d3::/64",
    );
    expect(normalizeClientIp("2001:0DB8:85A3:08D3::1")).toBe("2001:db8:85a3:8d3::/64");
    expect(normalizeClientIp("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(normalizeClientIp("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
    expect(normalizeClientIp("::1")).toBe("0:0:0:0::/64");
  });

  it("dois endereços do mesmo /64 dão a mesma chave", () => {
    expect(normalizeClientIp("2804:14c:1:2:aaaa::1")).toBe(
      normalizeClientIp("2804:14c:1:2:bbbb::9"),
    );
    expect(normalizeClientIp("2804:14c:1:2::1")).not.toBe(normalizeClientIp("2804:14c:1:3::1"));
  });

  it("endereço ilegível ou ausente vira a chave de IP desconhecido", () => {
    for (const address of [
      null,
      "",
      "unknown",
      "256.1.1.1",
      "1.2.3",
      "1.2.3.4::",
      "2001:db8::1::2",
      "2001:db8:1:2:3:4:5:6:7",
      "2001:db8:1:2:3:4:5",
      "12345::1",
      "gggg::1",
      ":::",
    ]) {
      expect(normalizeClientIp(address)).toBe(UNKNOWN_CLIENT_IP);
    }
  });
});

function countMap(
  device: { hour: number; day: number },
  ip: { hour: number; day: number },
): PreviewRequestCountMap {
  return { device, ip };
}

describe("findExceededPreviewLimit (PRD §6, D-02)", () => {
  it("abaixo de todos os limites não bloqueia", () => {
    expect(
      findExceededPreviewLimit(
        countMap(
          {
            hour: PREVIEW_RATE_LIMIT_PER_HOUR.device - 1,
            day: PREVIEW_RATE_LIMIT_PER_DAY.device - 1,
          },
          { hour: PREVIEW_RATE_LIMIT_PER_HOUR.ip - 1, day: PREVIEW_RATE_LIMIT_PER_DAY.ip - 1 },
        ),
      ),
    ).toBeNull();
  });

  it("a contagem já no limite bloqueia o próximo envio", () => {
    expect(
      findExceededPreviewLimit(
        countMap({ hour: PREVIEW_RATE_LIMIT_PER_HOUR.device, day: 0 }, { hour: 0, day: 0 }),
      ),
    ).toEqual({ key: "device", window: "hour" });
    expect(
      findExceededPreviewLimit(
        countMap({ hour: 0, day: PREVIEW_RATE_LIMIT_PER_DAY.device }, { hour: 0, day: 0 }),
      ),
    ).toEqual({ key: "device", window: "day" });
    expect(
      findExceededPreviewLimit(
        countMap({ hour: 0, day: 0 }, { hour: PREVIEW_RATE_LIMIT_PER_HOUR.ip, day: 0 }),
      ),
    ).toEqual({ key: "ip", window: "hour" });
    expect(
      findExceededPreviewLimit(
        countMap({ hour: 0, day: 0 }, { hour: 0, day: PREVIEW_RATE_LIMIT_PER_DAY.ip }),
      ),
    ).toEqual({ key: "ip", window: "day" });
  });
});

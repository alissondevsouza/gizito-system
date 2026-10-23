import { describe, expect, it } from "bun:test";
import { createWebhookRateLimiter, UNKNOWN_CLIENT_KEY } from "#src/http/webhook-rate-limit.ts";

const START = new Date("2026-10-22T12:00:00.000Z");

function limiterAt(limitPerMinute: number) {
  let currentTime = START;
  const limiter = createWebhookRateLimiter({ limitPerMinute, now: () => currentTime });
  const advance = (ms: number) => {
    currentTime = new Date(currentTime.getTime() + ms);
  };
  return { limiter, advance };
}

describe("rate limit do webhook por IP (spec F2-04, RF-08)", () => {
  it("deixa passar até o limite no minuto e barra a chamada seguinte", () => {
    const { limiter } = limiterAt(3);
    expect([limiter.take("10.0.0.1"), limiter.take("10.0.0.1"), limiter.take("10.0.0.1")]).toEqual([
      true,
      true,
      true,
    ]);
    expect(limiter.take("10.0.0.1")).toBe(false);
    expect(limiter.take("10.0.0.2")).toBe(true);
  });

  it("zera na janela do minuto seguinte e junta os IPs desconhecidos numa chave só", () => {
    const { limiter, advance } = limiterAt(1);
    expect(limiter.take(null)).toBe(true);
    expect(limiter.take(UNKNOWN_CLIENT_KEY)).toBe(false);
    advance(59_000);
    expect(limiter.take(null)).toBe(false);
    advance(1_000);
    expect(limiter.take(null)).toBe(true);
  });
});

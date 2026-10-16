import { describe, expect, it } from "bun:test";
import { apiHealthSchema, workerHealthSchema } from "#src/health/schemas.ts";

const queue = {
  readyCount: 2,
  oldestReadyAgeSeconds: 40,
  activeCount: 1,
  failedCount: 0,
  payloadInvalidCount: 0,
};

describe("contratos de health", () => {
  it("api responde ok ou unavailable", () => {
    expect(apiHealthSchema.safeParse({ status: "ok" }).success).toBe(true);
    expect(apiHealthSchema.safeParse({ status: "unavailable" }).success).toBe(true);
    expect(apiHealthSchema.safeParse({ status: "degraded" }).success).toBe(false);
  });

  it("worker ok traz métricas da fila; unavailable traz queue nula", () => {
    expect(workerHealthSchema.safeParse({ status: "ok", queue }).success).toBe(true);
    expect(
      workerHealthSchema.safeParse({
        status: "ok",
        queue: { ...queue, oldestReadyAgeSeconds: null },
      }).success,
    ).toBe(true);
    expect(workerHealthSchema.safeParse({ status: "unavailable", queue: null }).success).toBe(true);
    expect(workerHealthSchema.safeParse({ status: "ok", queue: null }).success).toBe(false);
    expect(workerHealthSchema.safeParse({ status: "unavailable", queue }).success).toBe(false);
  });

  it("contagens são inteiras e não negativas", () => {
    expect(
      workerHealthSchema.safeParse({ status: "ok", queue: { ...queue, readyCount: -1 } }).success,
    ).toBe(false);
    expect(
      workerHealthSchema.safeParse({ status: "ok", queue: { ...queue, activeCount: 1.5 } }).success,
    ).toBe(false);
  });
});

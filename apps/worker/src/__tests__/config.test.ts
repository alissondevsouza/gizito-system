import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
  DEFAULT_GENERATE_CONCURRENCY,
  DEFAULT_WORKER_HEALTH_PORT,
  MAX_GENERATE_CONCURRENCY,
  workerConfigSchema,
} from "#src/config.ts";

const validEnvironment = {
  DATABASE_URL: "postgres://gizito:gizito@127.0.0.1:5433/gizito",
  PAYMENT_GATEWAY: "fake",
};

describe("config do worker", () => {
  it("aplica defaults de porta do health e concorrência da geração", () => {
    expect(workerConfigSchema.parse(validEnvironment)).toMatchObject({
      WORKER_HEALTH_PORT: DEFAULT_WORKER_HEALTH_PORT,
      GENERATE_CONCURRENCY: DEFAULT_GENERATE_CONCURRENCY,
      HOST: "127.0.0.1",
    });
    expect(
      workerConfigSchema.parse({ ...validEnvironment, GENERATE_CONCURRENCY: "3" })
        .GENERATE_CONCURRENCY,
    ).toBe(3);
  });

  it("nomeia DATABASE_URL quando falta", () => {
    const result = workerConfigSchema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(z.prettifyError(result.error)).toContain("DATABASE_URL");
  });

  it("recusa GENERATE_CONCURRENCY menor que 1, acima do teto ou fracionária", () => {
    expect(
      workerConfigSchema.safeParse({
        ...validEnvironment,
        GENERATE_CONCURRENCY: String(MAX_GENERATE_CONCURRENCY),
      }).success,
    ).toBe(true);
    for (const GENERATE_CONCURRENCY of ["0", "-1", "1.5", "muitos", "9"]) {
      expect(
        workerConfigSchema.safeParse({ ...validEnvironment, GENERATE_CONCURRENCY }).success,
      ).toBe(false);
    }
  });

  it("recusa LOG_LEVEL=debug em produção, nomeando o campo", () => {
    const result = workerConfigSchema.safeParse({
      ...validEnvironment,
      NODE_ENV: "production",
      PAYMENT_GATEWAY: "mercadopago",
      LOG_LEVEL: "debug",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(["LOG_LEVEL"]);
  });

  it("PAYMENT_GATEWAY é obrigatória", () => {
    const { PAYMENT_GATEWAY: _omitted, ...withoutGateway } = validEnvironment;
    const result = workerConfigSchema.safeParse(withoutGateway);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(z.prettifyError(result.error)).toContain("PAYMENT_GATEWAY");
  });

  it("recusa PAYMENT_GATEWAY=fake em produção, nomeando o campo", () => {
    const result = workerConfigSchema.safeParse({ ...validEnvironment, NODE_ENV: "production" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(z.prettifyError(result.error)).toContain("PAYMENT_GATEWAY");
    expect(
      workerConfigSchema.safeParse({
        ...validEnvironment,
        NODE_ENV: "production",
        PAYMENT_GATEWAY: "mercadopago",
      }).success,
    ).toBe(true);
  });
});

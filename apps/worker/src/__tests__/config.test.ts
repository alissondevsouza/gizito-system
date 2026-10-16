import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
  DEFAULT_GENERATE_CONCURRENCY,
  DEFAULT_WORKER_HEALTH_PORT,
  workerConfigSchema,
} from "#src/config.ts";

const validEnvironment = { DATABASE_URL: "postgres://gizito:gizito@127.0.0.1:5433/gizito" };

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

  it("recusa GENERATE_CONCURRENCY menor que 1 ou fracionária", () => {
    for (const GENERATE_CONCURRENCY of ["0", "-1", "1.5", "muitos"]) {
      expect(
        workerConfigSchema.safeParse({ ...validEnvironment, GENERATE_CONCURRENCY }).success,
      ).toBe(false);
    }
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

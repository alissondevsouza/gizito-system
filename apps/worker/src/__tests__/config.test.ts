import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
  DEFAULT_GENERATE_CONCURRENCY,
  DEFAULT_RENDER_CONCURRENCY,
  DEFAULT_WORKER_HEALTH_PORT,
  MAX_GENERATE_CONCURRENCY,
  MAX_RENDER_CONCURRENCY,
  workerConfigSchema,
} from "#src/config.ts";

const validEnvironment = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://gizito:gizito@127.0.0.1:5433/gizito",
  PAYMENT_GATEWAY: "fake",
  AI_API_KEY: "chave-de-teste",
  AI_MODEL_EXTRACT: "claude-haiku-5-5",
  AI_MODEL_GENERATE: "claude-sonnet-5-5",
  R2_ENDPOINT: "http://127.0.0.1:9000",
  R2_BUCKET: "gizito",
  R2_ACCESS_KEY_ID: "gizito",
  R2_SECRET_ACCESS_KEY: "segredo-de-teste",
};

const productionEnvironment = {
  ...validEnvironment,
  NODE_ENV: "production",
  PAYMENT_GATEWAY: "mercadopago",
  R2_ENDPOINT: "https://conta.r2.cloudflarestorage.com",
};

describe("config do worker", () => {
  it("aplica defaults de porta do health e concorrência da geração", () => {
    expect(workerConfigSchema.parse(validEnvironment)).toMatchObject({
      WORKER_HEALTH_PORT: DEFAULT_WORKER_HEALTH_PORT,
      GENERATE_CONCURRENCY: DEFAULT_GENERATE_CONCURRENCY,
      RENDER_CONCURRENCY: DEFAULT_RENDER_CONCURRENCY,
      HOST: "127.0.0.1",
    });
    expect(
      workerConfigSchema.parse({ ...validEnvironment, GENERATE_CONCURRENCY: "3" })
        .GENERATE_CONCURRENCY,
    ).toBe(3);
  });

  it("nomeia NODE_ENV e DATABASE_URL quando faltam", () => {
    const result = workerConfigSchema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) return;
    const message = z.prettifyError(result.error);
    expect(message).toContain("NODE_ENV");
    expect(message).toContain("DATABASE_URL");
  });

  it("NODE_ENV é obrigatória e sem default", () => {
    const { NODE_ENV: _omitted, ...withoutNodeEnv } = validEnvironment;
    const result = workerConfigSchema.safeParse(withoutNodeEnv);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(["NODE_ENV"]);
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

  it("aceita RENDER_CONCURRENCY de 1 ao teto e recusa o resto (spec F1-08, RF-05)", () => {
    expect(
      workerConfigSchema.parse({
        ...validEnvironment,
        RENDER_CONCURRENCY: String(MAX_RENDER_CONCURRENCY),
      }).RENDER_CONCURRENCY,
    ).toBe(MAX_RENDER_CONCURRENCY);
    for (const RENDER_CONCURRENCY of ["0", "1.5", "muitos", String(MAX_RENDER_CONCURRENCY + 1)]) {
      expect(
        workerConfigSchema.safeParse({ ...validEnvironment, RENDER_CONCURRENCY }).success,
      ).toBe(false);
    }
  });

  it("recusa LOG_LEVEL=debug em produção, nomeando o campo", () => {
    const result = workerConfigSchema.safeParse({ ...productionEnvironment, LOG_LEVEL: "debug" });
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
    const result = workerConfigSchema.safeParse({
      ...productionEnvironment,
      PAYMENT_GATEWAY: "fake",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(z.prettifyError(result.error)).toContain("PAYMENT_GATEWAY");
    expect(workerConfigSchema.safeParse(productionEnvironment).success).toBe(true);
  });

  it("exige as chaves de IA e do storage, nomeando cada uma (spec F2-02, RF-11)", () => {
    const requiredKeyList = [
      "AI_API_KEY",
      "AI_MODEL_EXTRACT",
      "AI_MODEL_GENERATE",
      "R2_ENDPOINT",
      "R2_BUCKET",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
    ] as const;
    for (const key of requiredKeyList) {
      const { [key]: _omitted, ...withoutKey } = validEnvironment;
      const result = workerConfigSchema.safeParse(withoutKey);
      expect(result.success).toBe(false);
      if (result.success) continue;
      expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual([key]);
    }
  });

  it("recusa modelo de IA sem preço no adaptador, nomeando o campo", () => {
    const result = workerConfigSchema.safeParse({
      ...validEnvironment,
      AI_MODEL_GENERATE: "modelo-inventado",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(["AI_MODEL_GENERATE"]);
  });

  it("recusa R2_ENDPOINT sem https em produção, nomeando o campo", () => {
    const result = workerConfigSchema.safeParse({
      ...productionEnvironment,
      R2_ENDPOINT: "http://127.0.0.1:9000",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(["R2_ENDPOINT"]);
  });
});

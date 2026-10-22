import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { apiConfigSchema, DEFAULT_API_PORT } from "#src/config.ts";

const validEnvironment = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://gizito:gizito@127.0.0.1:5433/gizito",
  PAYMENT_GATEWAY: "fake",
  WEB_PUBLIC_URL: "http://localhost:3000",
  R2_ENDPOINT: "http://127.0.0.1:9000",
  R2_BUCKET: "gizito",
  R2_ACCESS_KEY_ID: "gizito",
  R2_SECRET_ACCESS_KEY: "gizito-local-dev",
  CLIENT_HASH_SECRET: "x".repeat(32),
};

const productionReadyEnvironment = {
  ...validEnvironment,
  NODE_ENV: "production",
  PAYMENT_GATEWAY: "mercadopago",
  MERCADOPAGO_ACCESS_TOKEN: "APP_USR-token-de-teste",
  MERCADOPAGO_WEBHOOK_SECRET: "segredo-do-webhook",
  R2_ENDPOINT: "https://conta.r2.cloudflarestorage.com",
  TRUSTED_PROXY_HOP_COUNT: "1",
};

describe("config da api (api.md §6)", () => {
  it("aplica defaults e converte a porta", () => {
    expect(apiConfigSchema.parse(validEnvironment)).toMatchObject({
      API_PORT: DEFAULT_API_PORT,
      HOST: "127.0.0.1",
      LOG_LEVEL: "info",
    });
    expect(apiConfigSchema.parse({ ...validEnvironment, API_PORT: "4100" }).API_PORT).toBe(4100);
  });

  it("nomeia cada obrigatória que falta", () => {
    const result = apiConfigSchema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) return;
    const message = z.prettifyError(result.error);
    expect(message).toContain("NODE_ENV");
    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("WEB_PUBLIC_URL");
  });

  it("NODE_ENV é obrigatória e sem default", () => {
    const { NODE_ENV: _omitted, ...withoutNodeEnv } = validEnvironment;
    const result = apiConfigSchema.safeParse(withoutNodeEnv);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(["NODE_ENV"]);
  });

  it("recusa WEB_PUBLIC_URL sem http(s) e porta inválida", () => {
    expect(
      apiConfigSchema.safeParse({ ...validEnvironment, WEB_PUBLIC_URL: "ftp://x.com" }).success,
    ).toBe(false);
    expect(apiConfigSchema.safeParse({ ...validEnvironment, API_PORT: "0" }).success).toBe(false);
  });

  it("recusa LOG_LEVEL=debug em produção, nomeando o campo", () => {
    const result = apiConfigSchema.safeParse({ ...productionReadyEnvironment, LOG_LEVEL: "debug" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(["LOG_LEVEL"]);
  });

  it("PAYMENT_GATEWAY é obrigatória", () => {
    const { PAYMENT_GATEWAY: _omitted, ...withoutGateway } = validEnvironment;
    const result = apiConfigSchema.safeParse(withoutGateway);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(z.prettifyError(result.error)).toContain("PAYMENT_GATEWAY");
  });

  it("mercadopago exige o access token e o segredo do webhook, nomeando cada um (spec F2-03, RF-11)", () => {
    const {
      MERCADOPAGO_ACCESS_TOKEN: _token,
      MERCADOPAGO_WEBHOOK_SECRET: _secret,
      ...withoutKeys
    } = productionReadyEnvironment;
    const result = apiConfigSchema.safeParse(withoutKeys);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual([
      "MERCADOPAGO_ACCESS_TOKEN",
      "MERCADOPAGO_WEBHOOK_SECRET",
    ]);
    const withEmptySecret = apiConfigSchema.safeParse({
      ...productionReadyEnvironment,
      MERCADOPAGO_WEBHOOK_SECRET: "",
    });
    expect(withEmptySecret.success).toBe(false);
  });

  it("devolve o gateway resolvido: mercadopago com as chaves, fake sem elas e asaas recusado", () => {
    expect(apiConfigSchema.parse(productionReadyEnvironment).paymentGateway).toEqual({
      name: "mercadopago",
      accessToken: "APP_USR-token-de-teste",
      webhookSecret: "segredo-do-webhook",
    });
    expect(apiConfigSchema.parse(validEnvironment).paymentGateway).toEqual({ name: "fake" });
    const asaas = apiConfigSchema.safeParse({ ...validEnvironment, PAYMENT_GATEWAY: "asaas" });
    expect(asaas.success).toBe(false);
    if (asaas.success) return;
    expect(z.prettifyError(asaas.error)).toContain("asaas ainda não tem adaptador");
  });

  it("recusa PAYMENT_GATEWAY=fake em produção, nomeando o campo", () => {
    const result = apiConfigSchema.safeParse({
      ...productionReadyEnvironment,
      PAYMENT_GATEWAY: "fake",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(z.prettifyError(result.error)).toContain("PAYMENT_GATEWAY");
    expect(apiConfigSchema.safeParse(productionReadyEnvironment).success).toBe(true);
  });

  it("nomeia as chaves do storage e o segredo do hash de cliente quando faltam (F2-01)", () => {
    const {
      R2_ENDPOINT: _endpoint,
      R2_BUCKET: _bucket,
      R2_ACCESS_KEY_ID: _accessKeyId,
      R2_SECRET_ACCESS_KEY: _secretAccessKey,
      CLIENT_HASH_SECRET: _clientHashSecret,
      ...withoutStorage
    } = validEnvironment;
    const result = apiConfigSchema.safeParse(withoutStorage);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join(".")).sort()).toEqual([
      "CLIENT_HASH_SECRET",
      "R2_ACCESS_KEY_ID",
      "R2_BUCKET",
      "R2_ENDPOINT",
      "R2_SECRET_ACCESS_KEY",
    ]);
    expect(
      apiConfigSchema.safeParse({ ...validEnvironment, CLIENT_HASH_SECRET: "curto" }).success,
    ).toBe(false);
    expect(apiConfigSchema.parse(validEnvironment)).toMatchObject({
      R2_REGION: "auto",
      TRUSTED_PROXY_HOP_COUNT: 0,
    });
  });

  it("em produção, recusa storage sem https e api sem proxy confiável, nomeando o campo", () => {
    for (const [field, value] of [
      ["R2_ENDPOINT", "http://127.0.0.1:9000"],
      ["TRUSTED_PROXY_HOP_COUNT", "0"],
    ] as const) {
      const result = apiConfigSchema.safeParse({ ...productionReadyEnvironment, [field]: value });
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual([field]);
    }
  });
});

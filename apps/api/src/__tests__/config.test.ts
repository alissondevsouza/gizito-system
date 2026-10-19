import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { apiConfigSchema, DEFAULT_API_PORT } from "#src/config.ts";

const validEnvironment = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://gizito:gizito@127.0.0.1:5433/gizito",
  PAYMENT_GATEWAY: "fake",
  WEB_PUBLIC_URL: "http://localhost:3000",
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
    const result = apiConfigSchema.safeParse({
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
    const result = apiConfigSchema.safeParse(withoutGateway);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(z.prettifyError(result.error)).toContain("PAYMENT_GATEWAY");
  });

  it("recusa PAYMENT_GATEWAY=fake em produção, nomeando o campo", () => {
    const result = apiConfigSchema.safeParse({ ...validEnvironment, NODE_ENV: "production" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(z.prettifyError(result.error)).toContain("PAYMENT_GATEWAY");
    expect(
      apiConfigSchema.safeParse({
        ...validEnvironment,
        NODE_ENV: "production",
        PAYMENT_GATEWAY: "mercadopago",
      }).success,
    ).toBe(true);
  });
});

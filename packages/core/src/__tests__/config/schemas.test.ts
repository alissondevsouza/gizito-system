import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
  aiEnvironmentSchema,
  aiModelSettingSchema,
  checkProductionEnvironment,
  isLogLevelAllowed,
  isPaymentGatewayAllowed,
  nodeEnvList,
  paymentEnvironmentSchema,
  portSchema,
  sharedEnvironmentSchema,
} from "#src/config/schemas.ts";

const validEnvironment = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://gizito:gizito@127.0.0.1:5433/gizito",
} as const;

describe("ambiente compartilhado das apps (api.md §6)", () => {
  it("aplica os defaults de LOG_LEVEL e HOST", () => {
    expect(sharedEnvironmentSchema.parse(validEnvironment)).toEqual({
      ...validEnvironment,
      LOG_LEVEL: "info",
      HOST: "127.0.0.1",
    });
  });

  it("nomeia NODE_ENV e DATABASE_URL quando faltam", () => {
    const result = sharedEnvironmentSchema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual([
      "NODE_ENV",
      "DATABASE_URL",
    ]);
    const message = z.prettifyError(result.error);
    expect(message).toContain("NODE_ENV");
    expect(message).toContain("DATABASE_URL");
  });

  it("NODE_ENV é obrigatório e sem default, para a proteção de produção não ficar aberta", () => {
    const { NODE_ENV: _omitted, ...withoutNodeEnv } = validEnvironment;
    const result = sharedEnvironmentSchema.safeParse(withoutNodeEnv);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(["NODE_ENV"]);
    for (const NODE_ENV of nodeEnvList) {
      expect(sharedEnvironmentSchema.parse({ ...validEnvironment, NODE_ENV }).NODE_ENV).toBe(
        NODE_ENV,
      );
    }
  });

  it("recusa DATABASE_URL que não é postgres", () => {
    for (const DATABASE_URL of ["", "mysql://127.0.0.1/gizito", "não é url"]) {
      expect(sharedEnvironmentSchema.safeParse({ ...validEnvironment, DATABASE_URL }).success).toBe(
        false,
      );
    }
    const postgresql = { ...validEnvironment, DATABASE_URL: "postgresql://127.0.0.1/gizito" };
    expect(sharedEnvironmentSchema.safeParse(postgresql).success).toBe(true);
  });

  it("recusa LOG_LEVEL e NODE_ENV fora da lista", () => {
    expect(
      sharedEnvironmentSchema.safeParse({ ...validEnvironment, LOG_LEVEL: "loud" }).success,
    ).toBe(false);
    expect(
      sharedEnvironmentSchema.safeParse({ ...validEnvironment, NODE_ENV: "staging" }).success,
    ).toBe(false);
  });

  it("porta vem do env como texto e precisa ser inteira entre 1 e 65535", () => {
    expect(portSchema.parse("3001")).toBe(3001);
    for (const port of ["", "0", "65536", "30.5", "abc"]) {
      expect(portSchema.safeParse(port).success).toBe(false);
    }
  });
});

describe("guardas de produção no ambiente", () => {
  it("PAYMENT_GATEWAY é obrigatório e sem default", () => {
    expect(paymentEnvironmentSchema.safeParse({}).success).toBe(false);
    expect(paymentEnvironmentSchema.parse({ PAYMENT_GATEWAY: "fake" })).toEqual({
      PAYMENT_GATEWAY: "fake",
    });
  });

  it("fake é recusado só em produção", () => {
    expect(isPaymentGatewayAllowed({ NODE_ENV: "production", PAYMENT_GATEWAY: "fake" })).toBe(
      false,
    );
    expect(
      isPaymentGatewayAllowed({ NODE_ENV: "production", PAYMENT_GATEWAY: "mercadopago" }),
    ).toBe(true);
    for (const NODE_ENV of ["development", "test"] as const) {
      expect(isPaymentGatewayAllowed({ NODE_ENV, PAYMENT_GATEWAY: "fake" })).toBe(true);
    }
  });

  it("debug e trace são recusados só em produção (privacy-security.md)", () => {
    for (const LOG_LEVEL of ["debug", "trace"] as const) {
      expect(isLogLevelAllowed({ NODE_ENV: "production", LOG_LEVEL })).toBe(false);
      expect(isLogLevelAllowed({ NODE_ENV: "development", LOG_LEVEL })).toBe(true);
    }
    expect(isLogLevelAllowed({ NODE_ENV: "production", LOG_LEVEL: "info" })).toBe(true);
  });

  it("checkProductionEnvironment aponta cada campo recusado", () => {
    const issueList: { path: string[] }[] = [];
    checkProductionEnvironment(
      { NODE_ENV: "production", LOG_LEVEL: "debug", PAYMENT_GATEWAY: "fake" },
      { addIssue: (issue) => issueList.push(issue) },
    );
    expect(issueList.map((issue) => issue.path)).toEqual([["PAYMENT_GATEWAY"], ["LOG_LEVEL"]]);
  });
});

describe("ambiente da IA (F1-05)", () => {
  const aiEnvironment = {
    AI_API_KEY: "chave-de-teste",
    AI_MODEL_EXTRACT: "modelo-extracao",
    AI_MODEL_GENERATE: "modelo-geracao",
  };

  it("exige chave e os dois modelos; esforço é opcional", () => {
    expect(aiEnvironmentSchema.parse(aiEnvironment)).toEqual(aiEnvironment);
    expect(
      aiEnvironmentSchema.parse({ ...aiEnvironment, AI_EFFORT_GENERATE: "high" })
        .AI_EFFORT_GENERATE,
    ).toBe("high");
  });

  it.each([
    ["chave vazia", { ...aiEnvironment, AI_API_KEY: "  " }],
    ["sem modelo de extração", { ...aiEnvironment, AI_MODEL_EXTRACT: undefined }],
    ["esforço fora da lista", { ...aiEnvironment, AI_EFFORT_EXTRACT: "altissimo" }],
  ])("recusa %s", (_, environment) => {
    expect(aiEnvironmentSchema.safeParse(environment).success).toBe(false);
  });

  it("configuração de modelo por etapa aceita esforço opcional", () => {
    expect(aiModelSettingSchema.parse({ model: "modelo" })).toEqual({ model: "modelo" });
    expect(aiModelSettingSchema.safeParse({ model: "", effort: "low" }).success).toBe(false);
  });
});

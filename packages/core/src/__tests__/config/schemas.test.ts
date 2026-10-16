import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
  isPaymentGatewayAllowed,
  paymentEnvironmentSchema,
  portSchema,
  sharedEnvironmentSchema,
} from "#src/config/schemas.ts";

const validEnvironment = { DATABASE_URL: "postgres://gizito:gizito@127.0.0.1:5433/gizito" };

describe("ambiente compartilhado das apps (api.md §6)", () => {
  it("aplica os defaults de NODE_ENV, LOG_LEVEL e HOST", () => {
    expect(sharedEnvironmentSchema.parse(validEnvironment)).toEqual({
      ...validEnvironment,
      NODE_ENV: "development",
      LOG_LEVEL: "info",
      HOST: "127.0.0.1",
    });
  });

  it("nomeia DATABASE_URL quando falta", () => {
    const result = sharedEnvironmentSchema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(["DATABASE_URL"]);
    expect(z.prettifyError(result.error)).toContain("DATABASE_URL");
  });

  it("recusa DATABASE_URL que não é postgres", () => {
    for (const DATABASE_URL of ["", "mysql://127.0.0.1/gizito", "não é url"]) {
      expect(sharedEnvironmentSchema.safeParse({ DATABASE_URL }).success).toBe(false);
    }
    const postgresql = { DATABASE_URL: "postgresql://127.0.0.1/gizito" };
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

describe("gateway de pagamento no ambiente", () => {
  it("default é o fake, para dev e testes", () => {
    expect(paymentEnvironmentSchema.parse({})).toEqual({ PAYMENT_GATEWAY: "fake" });
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
});

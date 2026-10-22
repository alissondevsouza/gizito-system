import { describe, expect, it } from "bun:test";
import { maskEmail, maskedEmailSchema } from "#src/order/email.ts";

describe("maskEmail", () => {
  it("mantém só a primeira letra do usuário e o domínio", () => {
    expect(maskEmail("mae.da.ana@example.com")).toBe("m***@example.com");
    expect(maskEmail("a@b.com.br")).toBe("a***@b.com.br");
  });

  it("o schema da visão aceita o e-mail mascarado e recusa o e-mail inteiro", () => {
    expect(maskedEmailSchema.safeParse(maskEmail("mae@example.com")).success).toBe(true);
    expect(maskedEmailSchema.safeParse("mae@example.com").success).toBe(false);
    expect(maskedEmailSchema.safeParse("ma***@example.com").success).toBe(false);
  });
});

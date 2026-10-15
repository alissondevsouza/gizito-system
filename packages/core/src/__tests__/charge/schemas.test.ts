import { describe, expect, it } from "bun:test";
import { buildCharge } from "#src/__tests__/__fixtures__/entities.ts";
import { chargeSchema } from "#src/charge/schemas.ts";

describe("chargeSchema", () => {
  it("aceita cobrança pendente e cobrança paga", () => {
    expect(chargeSchema.safeParse(buildCharge()).success).toBe(true);
    expect(
      chargeSchema.safeParse(
        buildCharge({
          status: "paid",
          gatewayPaymentId: "pay-1",
          paidDatetime: new Date("2026-10-15T12:10:00.000Z"),
          ticketUrl: "https://example.com/ticket",
        }),
      ).success,
    ).toBe(true);
  });
  it("rejeita valor não positivo, gateway desconhecido, qr vazio e ticketUrl inválida", () => {
    expect(chargeSchema.safeParse(buildCharge({ amountCents: 0 })).success).toBe(false);
    expect(chargeSchema.safeParse(buildCharge({ amountCents: 29.9 })).success).toBe(false);
    expect(chargeSchema.safeParse({ ...buildCharge(), gateway: "paypal" }).success).toBe(false);
    expect(chargeSchema.safeParse(buildCharge({ qrCode: "" })).success).toBe(false);
    expect(chargeSchema.safeParse(buildCharge({ ticketUrl: "ticket" })).success).toBe(false);
  });
});

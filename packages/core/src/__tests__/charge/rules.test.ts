import { describe, expect, it } from "bun:test";
import { buildCharge, FIXED_NOW } from "#src/__tests__/__fixtures__/entities.ts";
import {
  chargeExpireDatetime,
  deriveAwaitingPaymentSubstate,
  isChargeActive,
  isChargeExpired,
} from "#src/charge/rules.ts";

const EXPIRE = new Date("2026-10-15T12:30:00.000Z");

describe("regras de cobrança (PRD §9.1)", () => {
  it("cobrança expira 30 minutos depois de criada", () => {
    expect(chargeExpireDatetime(FIXED_NOW)).toEqual(EXPIRE);
  });

  it("pendente antes do vencimento está ativa; no instante exato do vencimento já expirou", () => {
    const charge = buildCharge({ expireDatetime: EXPIRE });
    expect(isChargeExpired(charge, new Date("2026-10-15T12:29:59.999Z"))).toBe(false);
    expect(isChargeActive(charge, new Date("2026-10-15T12:29:59.999Z"))).toBe(true);
    expect(isChargeExpired(charge, EXPIRE)).toBe(true);
    expect(isChargeActive(charge, EXPIRE)).toBe(false);
  });

  it("status expired é expirado independente do relógio; paga nunca expira", () => {
    expect(isChargeExpired(buildCharge({ status: "expired" }), FIXED_NOW)).toBe(true);
    const paid = buildCharge({ status: "paid", expireDatetime: EXPIRE });
    expect(isChargeExpired(paid, new Date("2027-01-01T00:00:00.000Z"))).toBe(false);
    expect(isChargeActive(paid, FIXED_NOW)).toBe(false);
  });

  it("sub-estado charge_expired deriva da cobrança, nunca do status do pedido", () => {
    expect(deriveAwaitingPaymentSubstate(null, FIXED_NOW)).toBeNull();
    expect(
      deriveAwaitingPaymentSubstate(buildCharge({ expireDatetime: EXPIRE }), FIXED_NOW),
    ).toBeNull();
    expect(
      deriveAwaitingPaymentSubstate(
        buildCharge({ expireDatetime: EXPIRE }),
        new Date("2026-10-15T12:31:00.000Z"),
      ),
    ).toBe("charge_expired");
    expect(deriveAwaitingPaymentSubstate(buildCharge({ status: "expired" }), FIXED_NOW)).toBe(
      "charge_expired",
    );
  });
});

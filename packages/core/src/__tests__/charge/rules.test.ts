import { describe, expect, it } from "bun:test";
import { buildCharge, FIXED_NOW } from "#src/__tests__/__fixtures__/entities.ts";
import {
  ChargeAmountMismatchError,
  ChargePaymentMismatchError,
  chargeExpireDatetime,
  decidePaymentConfirmation,
  deriveAwaitingPaymentSubstate,
  isChargeActive,
  isChargeExpired,
} from "#src/charge/rules.ts";
import { orderStatusList } from "#src/enums.ts";
import { InvalidTransitionError, postPaymentOrderStatusList } from "#src/order/state-machine.ts";

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

describe("decidePaymentConfirmation (PRD §5, state-machine.md §4)", () => {
  const pendingWithPaymentId = buildCharge({ gatewayPaymentId: "pay-1" });
  const payment = (gatewayPaymentId: string, amountCents = 2990) => ({
    gatewayPaymentId,
    amountCents,
  });

  it("pedido aguardando pagamento e cobrança pendente ou expirada: marca pago", () => {
    expect(
      decidePaymentConfirmation("awaiting_payment", pendingWithPaymentId, payment("pay-1")),
    ).toEqual({
      ok: true,
      value: { kind: "paid", nextOrderStatus: "paid" },
    });
    expect(decidePaymentConfirmation("awaiting_payment", buildCharge(), payment("pay-1"))).toEqual({
      ok: true,
      value: { kind: "paid", nextOrderStatus: "paid" },
    });
    expect(
      decidePaymentConfirmation(
        "awaiting_payment",
        buildCharge({ status: "expired" }),
        payment("pay-1"),
      ),
    ).toEqual({ ok: true, value: { kind: "paid", nextOrderStatus: "paid" } });
  });

  it("cobrança já paga ou reembolsada com o mesmo pagamento: no-op", () => {
    for (const status of ["paid", "refunded"] as const) {
      expect(
        decidePaymentConfirmation(
          "paid",
          buildCharge({ status, gatewayPaymentId: "pay-1" }),
          payment("pay-1"),
        ),
      ).toEqual({ ok: true, value: { kind: "already_paid" } });
    }
  });

  it("outra cobrança paga com o pedido já pago ou posterior: pagamento duplicado", () => {
    for (const status of postPaymentOrderStatusList) {
      expect(
        decidePaymentConfirmation(status, buildCharge({ status: "expired" }), payment("pay-2")),
      ).toEqual({ ok: true, value: { kind: "duplicate_payment" } });
    }
  });

  it("cobrança ligada a outro pagamento: erro, nunca sobrescreve", () => {
    for (const status of ["pending", "paid"] as const) {
      const result = decidePaymentConfirmation(
        "awaiting_payment",
        buildCharge({ status, gatewayPaymentId: "pay-1" }),
        payment("pay-2"),
      );
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error).toBeInstanceOf(ChargePaymentMismatchError);
      expect(result.error.code).toBe("charge_payment_mismatch");
      expect(result.error.message).toContain(pendingWithPaymentId.chargeId);
    }
  });

  it("valor pago diferente do da cobrança: erro antes de qualquer decisão, mesmo já paga (spec F2-04, RF-04)", () => {
    for (const status of ["pending", "paid", "expired"] as const) {
      const result = decidePaymentConfirmation(
        "awaiting_payment",
        buildCharge({ status, gatewayPaymentId: "pay-1", amountCents: 2990 }),
        payment("pay-1", 2000),
      );
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error).toBeInstanceOf(ChargeAmountMismatchError);
      expect(result.error.code).toBe("charge_amount_mismatch");
      expect(result.error.message).toContain("2990");
      expect(result.error.message).toContain("2000");
    }
    expect(
      decidePaymentConfirmation(
        "paid",
        buildCharge({ gatewayPaymentId: "pay-1" }),
        payment("pay-2", 1),
      ).ok,
    ).toBe(false);
  });

  it("pedido antes de awaiting_payment: transição inválida", () => {
    const prePaymentList = orderStatusList.filter(
      (status) => status !== "awaiting_payment" && !postPaymentOrderStatusList.includes(status),
    );
    expect(prePaymentList).toEqual(["draft", "analyzing", "preview_ready"]);
    for (const status of prePaymentList) {
      const result = decidePaymentConfirmation(status, pendingWithPaymentId, payment("pay-1"));
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error).toBeInstanceOf(InvalidTransitionError);
    }
  });
});

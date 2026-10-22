import { describe, expect, it } from "bun:test";
import { buildCharge, FIXED_NOW, ORDER_ID } from "#src/__tests__/__fixtures__/entities.ts";
import {
  chargeReconcileOutcomeList,
  decideChargeReconciliation,
  paymentMismatchReasonList,
} from "#src/charge/reconcile.ts";
import { outcomeCodeSchema } from "#src/common.ts";
import type { ChargeStatusResult } from "#src/interfaces/payment-gateway.ts";

const PAID_DATETIME = new Date("2026-10-15T12:10:00.000Z");

function statusResult(overrides: Partial<ChargeStatusResult> = {}): ChargeStatusResult {
  return {
    status: "pending",
    gatewayPaymentId: "pay-1",
    amountCents: 2990,
    externalReference: ORDER_ID,
    paidDatetime: null,
    ...overrides,
  };
}

describe("decideChargeReconciliation (spec F2-04, RF-03)", () => {
  it("pago no gateway confirma com o id do pagamento e a data do gateway", () => {
    expect(
      decideChargeReconciliation(
        buildCharge(),
        statusResult({ status: "paid", paidDatetime: PAID_DATETIME }),
        FIXED_NOW,
      ),
    ).toEqual({ kind: "confirm_payment", gatewayPaymentId: "pay-1", paidDatetime: PAID_DATETIME });
  });

  it("pago sem data usa o relógio recebido; sem id na consulta usa o da cobrança; sem os dois é divergência", () => {
    expect(
      decideChargeReconciliation(buildCharge(), statusResult({ status: "paid" }), FIXED_NOW),
    ).toEqual({ kind: "confirm_payment", gatewayPaymentId: "pay-1", paidDatetime: FIXED_NOW });
    expect(
      decideChargeReconciliation(
        buildCharge({ gatewayPaymentId: "pay-from-charge" }),
        statusResult({ status: "paid", gatewayPaymentId: null }),
        FIXED_NOW,
      ),
    ).toMatchObject({ kind: "confirm_payment", gatewayPaymentId: "pay-from-charge" });
    expect(
      decideChargeReconciliation(
        buildCharge({ gatewayPaymentId: null }),
        statusResult({ status: "paid", gatewayPaymentId: null }),
        FIXED_NOW,
      ),
    ).toEqual({ kind: "mismatch", reason: "payment_id_missing" });
  });

  it("pago em cobrança já expirada no banco também confirma: o dinheiro entrou", () => {
    expect(
      decideChargeReconciliation(
        buildCharge({ status: "expired" }),
        statusResult({ status: "paid", paidDatetime: PAID_DATETIME }),
        FIXED_NOW,
      ),
    ).toMatchObject({ kind: "confirm_payment" });
  });

  it("expirado no gateway expira a pendente, mesmo antes do vencimento; outro status não muda", () => {
    const beforeExpiry = new Date("2026-10-15T12:05:00.000Z");
    expect(
      decideChargeReconciliation(buildCharge(), statusResult({ status: "expired" }), beforeExpiry),
    ).toEqual({ kind: "expire" });
    for (const status of ["expired", "paid", "refunded"] as const) {
      expect(
        decideChargeReconciliation(
          buildCharge({ status }),
          statusResult({ status: "expired" }),
          FIXED_NOW,
        ),
      ).toEqual({ kind: "no_change", outcome: "expired" });
    }
  });

  it("pendente e reembolsado não mudam nada e levam o desfecho", () => {
    expect(decideChargeReconciliation(buildCharge(), statusResult(), FIXED_NOW)).toEqual({
      kind: "no_change",
      outcome: "pending",
    });
    expect(
      decideChargeReconciliation(buildCharge(), statusResult({ status: "refunded" }), FIXED_NOW),
    ).toEqual({ kind: "no_change", outcome: "refunded" });
  });

  it("referência de outro pedido ou valor diferente é divergência antes de olhar o status", () => {
    expect(
      decideChargeReconciliation(
        buildCharge(),
        statusResult({ status: "paid", externalReference: "77777777-7777-4777-8777-777777777777" }),
        FIXED_NOW,
      ),
    ).toEqual({ kind: "mismatch", reason: "external_reference" });
    expect(
      decideChargeReconciliation(
        buildCharge(),
        statusResult({ status: "paid", amountCents: 2000 }),
        FIXED_NOW,
      ),
    ).toEqual({ kind: "mismatch", reason: "amount" });
    expect(
      decideChargeReconciliation(buildCharge(), statusResult({ amountCents: 2000 }), FIXED_NOW),
    ).toEqual({ kind: "mismatch", reason: "amount" });
  });

  it("referência nula não é divergência: a consulta pode não devolvê-la", () => {
    expect(
      decideChargeReconciliation(
        buildCharge(),
        statusResult({ status: "paid", externalReference: null }),
        FIXED_NOW,
      ),
    ).toMatchObject({ kind: "confirm_payment" });
  });

  it("desfechos e motivos cabem em outcome_code", () => {
    for (const code of [...chargeReconcileOutcomeList, ...paymentMismatchReasonList]) {
      expect(outcomeCodeSchema.safeParse(code).success).toBe(true);
    }
    expect(chargeReconcileOutcomeList).toContain("payment_mismatch");
    expect(chargeReconcileOutcomeList).toContain("charge_not_found");
  });
});

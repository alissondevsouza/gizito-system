import { describe, expect, it } from "bun:test";
import {
  chargeExpireDatetime,
  KIT_PRICE_CENTS,
  PaymentGatewayError,
  type PaymentGatewayErrorCode,
} from "@gizito/core";
import { describePaymentGatewayContract } from "#src/__tests__/payment/contract.ts";
import {
  buildFakeWebhookRequest,
  createFakePaymentGateway,
  FAKE_QR_CODE_BASE64,
  fakeGatewayOrderId,
  fakeGatewayPaymentId,
} from "#src/fakes/fake-payment-gateway.ts";

describePaymentGatewayContract("fake", {
  createGateway: createFakePaymentGateway,
  payerEmail: "mae@example.com",
  testTimeoutMs: 5_000,
});

const NOW = new Date("2026-10-22T12:00:00.000Z");
const CHARGE_ID = "11111111-1111-4111-8111-111111111111";
const ORDER_ID = "22222222-2222-4222-8222-222222222222";

const input = {
  chargeId: CHARGE_ID,
  orderId: ORDER_ID,
  amountCents: KIT_PRICE_CENTS,
  payerEmail: "mae@example.com",
  expireDatetime: chargeExpireDatetime(NOW),
};

const reference = {
  chargeId: CHARGE_ID,
  gatewayOrderId: fakeGatewayOrderId(CHARGE_ID),
  gatewayPaymentId: fakeGatewayPaymentId(CHARGE_ID),
};

async function expectGatewayError(promise: Promise<unknown>, code: PaymentGatewayErrorCode) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(PaymentGatewayError);
  expect(error instanceof PaymentGatewayError ? error.code : null).toBe(code);
}

describe("FakePaymentGateway (spec F2-03, RF-05)", () => {
  it("devolve ids, QR e imagem determinísticos e guarda as cobranças criadas", async () => {
    const gateway = createFakePaymentGateway();
    const created = await gateway.createCharge(input);
    expect(created).toEqual({
      gatewayOrderId: `fake-order-${CHARGE_ID}`,
      gatewayPaymentId: `fake-payment-${CHARGE_ID}`,
      qrCode: expect.stringContaining(CHARGE_ID),
      qrCodeBase64: FAKE_QR_CODE_BASE64,
      ticketUrl: null,
      expireDatetime: input.expireDatetime,
    });
    expect(gateway.createdChargeList).toEqual([created]);
    expect(gateway.createChargeInputList).toEqual([input]);
    expect(gateway.createCallCount).toBe(1);
  });

  it("mesmo chargeId com entrada diferente é recusado, como o 409 da chave de idempotência", async () => {
    const gateway = createFakePaymentGateway();
    await gateway.createCharge(input);
    await expectGatewayError(
      gateway.createCharge({ ...input, payerEmail: "outra@example.com" }),
      "gateway_rejected",
    );
    expect(gateway.createdChargeList).toHaveLength(1);
  });

  it("failNextCreate e failCreateAfter falham uma vez, sem criar, e contam a chamada", async () => {
    const gateway = createFakePaymentGateway();
    gateway.failNextCreate();
    await expectGatewayError(gateway.createCharge(input), "gateway_unavailable");
    expect(gateway.createdChargeList).toHaveLength(0);
    await gateway.createCharge(input);
    gateway.failCreateAfter(1, "gateway_rejected");
    await gateway.createCharge({ ...input, chargeId: "33333333-3333-4333-8333-333333333333" });
    await expectGatewayError(
      gateway.createCharge({ ...input, chargeId: "44444444-4444-4444-8444-444444444444" }),
      "gateway_rejected",
    );
    expect(gateway.createCallCount).toBe(4);
    expect(gateway.createdChargeList).toHaveLength(2);
  });

  it("markPaid, markExpired e failNextStatus mudam a consulta", async () => {
    const gateway = createFakePaymentGateway();
    await gateway.createCharge(input);
    gateway.markExpired(CHARGE_ID);
    expect((await gateway.getChargeStatus(reference)).status).toBe("expired");
    const paidDatetime = new Date("2026-10-22T12:05:00.000Z");
    gateway.markPaid(CHARGE_ID, paidDatetime);
    expect(await gateway.getChargeStatus(reference)).toEqual({
      status: "paid",
      gatewayPaymentId: fakeGatewayPaymentId(CHARGE_ID),
      amountCents: KIT_PRICE_CENTS,
      externalReference: ORDER_ID,
      paidDatetime,
    });
    gateway.failNextStatus();
    await expectGatewayError(gateway.getChargeStatus(reference), "gateway_unavailable");
    expect((await gateway.getChargeStatus(reference)).status).toBe("paid");
  });

  it("consulta de order desconhecida e reembolso de cobrança não paga são recusados", async () => {
    const gateway = createFakePaymentGateway();
    await expectGatewayError(gateway.getChargeStatus(reference), "gateway_rejected");
    await gateway.createCharge(input);
    await expectGatewayError(gateway.refund(reference), "gateway_rejected");
    gateway.markPaid(CHARGE_ID, NOW);
    expect(await gateway.refund(reference)).toEqual({ refundId: `fake-refund-${CHARGE_ID}` });
    expect((await gateway.getChargeStatus(reference)).status).toBe("refunded");
  });

  it("parseWebhook aceita o formato do fake e recusa assinatura e corpo inválidos", async () => {
    const gateway = createFakePaymentGateway();
    const request = buildFakeWebhookRequest({
      gatewayOrderId: reference.gatewayOrderId,
      action: "order.processed",
    });
    expect(await gateway.parseWebhook(request)).toEqual({
      valid: true,
      externalId: `${reference.gatewayOrderId}:order.processed`,
      gatewayOrderId: reference.gatewayOrderId,
      gatewayPaymentId: null,
    });
    expect(await gateway.parseWebhook({ ...request, headerMap: {} })).toEqual({
      valid: false,
      reason: "invalid_signature",
    });
    for (const rawBody of ["{", '{"action":"order.processed"}']) {
      expect(await gateway.parseWebhook({ ...request, rawBody })).toEqual({
        valid: false,
        reason: "malformed",
      });
    }
  });

  it("pauseCreate segura as criações até o release, e withQrImage: false imita o sandbox", async () => {
    const gateway = createFakePaymentGateway({ withQrImage: false });
    const gate = gateway.pauseCreate();
    let settled = false;
    const pending = gateway.createCharge(input).then((created) => {
      settled = true;
      return created;
    });
    await gate.waitForPendingCount(1);
    expect(settled).toBe(false);
    gate.release();
    expect((await pending).qrCodeBase64).toBeNull();
    const next = await gateway.createCharge({
      ...input,
      chargeId: "55555555-5555-4555-8555-555555555555",
    });
    expect(next.qrCodeBase64).toBeNull();
  });
});

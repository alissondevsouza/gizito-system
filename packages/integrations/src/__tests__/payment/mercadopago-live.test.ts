import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { describePaymentGatewayContract } from "#src/__tests__/payment/contract.ts";
import { createMercadoPagoGateway } from "#src/mercadopago/mercadopago-gateway.ts";

const LIVE_TEST_TIMEOUT_MS = 60_000;
const SANDBOX_PAYER_EMAIL = "test_payer@example.com";
const UNUSED_WEBHOOK_SECRET = "o-teste-real-nao-valida-webhook";

const liveEnvironmentSchema = z.object({
  MERCADOPAGO_TEST_ACCESS_TOKEN: z.string().trim().min(1),
  MERCADOPAGO_LIVE_EXPIRED_ORDER_ID: z.string().trim().min(1).optional(),
});

const liveEnvironment =
  process.env.PAYMENT_LIVE_TEST === "1" ? liveEnvironmentSchema.safeParse(process.env) : null;

function createSandboxGateway() {
  if (!liveEnvironment?.success) {
    throw new Error("PAYMENT_LIVE_TEST=1 e MERCADOPAGO_TEST_ACCESS_TOKEN são obrigatórios");
  }
  return createMercadoPagoGateway({
    accessToken: liveEnvironment.data.MERCADOPAGO_TEST_ACCESS_TOKEN,
    webhookSecret: UNUSED_WEBHOOK_SECRET,
  });
}

const expiredOrderId = liveEnvironment?.success
  ? liveEnvironment.data.MERCADOPAGO_LIVE_EXPIRED_ORDER_ID
  : undefined;

describe.skipIf(!liveEnvironment?.success)("sandbox do Mercado Pago (test:payment-live)", () => {
  describePaymentGatewayContract("Mercado Pago (sandbox)", {
    createGateway: createSandboxGateway,
    payerEmail: SANDBOX_PAYER_EMAIL,
    testTimeoutMs: LIVE_TEST_TIMEOUT_MS,
    onChargeCreated: (gatewayOrderId) => {
      console.info(
        `order criada no sandbox: ${gatewayOrderId}; depois de 30 min, rode de novo com MERCADOPAGO_LIVE_EXPIRED_ORDER_ID=${gatewayOrderId}`,
      );
    },
  });

  it.skipIf(expiredOrderId === undefined)(
    "a order criada há mais de 30 minutos ficou expired",
    async () => {
      const status = await createSandboxGateway().getChargeStatus({
        chargeId: crypto.randomUUID(),
        gatewayOrderId: expiredOrderId ?? "",
        gatewayPaymentId: null,
      });
      expect(status.status).toBe("expired");
    },
    LIVE_TEST_TIMEOUT_MS,
  );
});

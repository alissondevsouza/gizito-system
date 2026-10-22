import { describe, expect, it } from "bun:test";
import {
  chargeExpireDatetime,
  chargeStatusResultSchema,
  createdChargeSchema,
  KIT_PRICE_CENTS,
  type PaymentGateway,
  parsedWebhookSchema,
} from "@gizito/core";

export type PaymentGatewayContractSetup = {
  readonly createGateway: () => PaymentGateway;
  readonly payerEmail: string;
  readonly testTimeoutMs: number;
  readonly onChargeCreated?: (gatewayOrderId: string) => void;
};

function chargeInput(payerEmail: string) {
  return {
    chargeId: crypto.randomUUID(),
    orderId: crypto.randomUUID(),
    amountCents: KIT_PRICE_CENTS,
    payerEmail,
    expireDatetime: chargeExpireDatetime(new Date()),
  };
}

export function describePaymentGatewayContract(
  name: string,
  { createGateway, payerEmail, testTimeoutMs, onChargeCreated }: PaymentGatewayContractSetup,
) {
  describe(`contrato do PaymentGateway: ${name} (spec F2-03, RF-05 e RF-12)`, () => {
    it(
      "cria a cobrança, a repetição com o mesmo chargeId devolve a mesma e a consulta dá pending",
      async () => {
        const gateway = createGateway();
        const input = chargeInput(payerEmail);
        const created = createdChargeSchema.parse(await gateway.createCharge(input));
        onChargeCreated?.(created.gatewayOrderId);
        expect(created.qrCode.length).toBeGreaterThan(0);
        expect(created.expireDatetime).toEqual(input.expireDatetime);

        const repeated = await gateway.createCharge(input);
        expect(repeated.gatewayOrderId).toBe(created.gatewayOrderId);
        expect(repeated.gatewayPaymentId).toBe(created.gatewayPaymentId);

        const status = chargeStatusResultSchema.parse(
          await gateway.getChargeStatus({
            chargeId: input.chargeId,
            gatewayOrderId: created.gatewayOrderId,
            gatewayPaymentId: created.gatewayPaymentId,
          }),
        );
        expect(status).toMatchObject({
          status: "pending",
          amountCents: KIT_PRICE_CENTS,
          externalReference: input.orderId,
          paidDatetime: null,
        });
      },
      testTimeoutMs,
    );

    it(
      "duas cobranças do mesmo pedido são orders diferentes no gateway",
      async () => {
        const gateway = createGateway();
        const first = chargeInput(payerEmail);
        const second = { ...chargeInput(payerEmail), orderId: first.orderId };
        const [firstCreated, secondCreated] = [
          await gateway.createCharge(first),
          await gateway.createCharge(second),
        ];
        onChargeCreated?.(secondCreated.gatewayOrderId);
        expect(secondCreated.gatewayOrderId).not.toBe(firstCreated.gatewayOrderId);
      },
      testTimeoutMs,
    );

    it(
      "webhook sem assinatura é recusado sem IO",
      async () => {
        const parsed = parsedWebhookSchema.parse(
          await createGateway().parseWebhook({ headerMap: {}, queryMap: {}, rawBody: "{}" }),
        );
        expect(parsed.valid).toBe(false);
      },
      testTimeoutMs,
    );
  });
}

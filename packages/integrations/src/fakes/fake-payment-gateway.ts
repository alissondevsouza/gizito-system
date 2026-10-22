import {
  type ChargeStatus,
  type CreateChargeInput,
  type CreatedCharge,
  createChargeInputSchema,
  type PaymentGateway,
  PaymentGatewayError,
  type PaymentGatewayErrorCode,
  type WebhookRequest,
} from "@gizito/core";
import { z } from "zod";

export const FAKE_WEBHOOK_SIGNATURE_HEADER = "x-fake-signature";
export const FAKE_WEBHOOK_SIGNATURE = "fake-signature";
export const FAKE_QR_CODE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const fakeWebhookBodySchema = z.object({
  gatewayOrderId: z.string().min(1),
  action: z.string().min(1),
});
export type FakeWebhookBody = z.infer<typeof fakeWebhookBodySchema>;

export function fakeGatewayOrderId(chargeId: string): string {
  return `fake-order-${chargeId}`;
}

export function fakeGatewayPaymentId(chargeId: string): string {
  return `fake-payment-${chargeId}`;
}

export function buildFakeWebhookRequest(body: FakeWebhookBody): WebhookRequest {
  return {
    headerMap: { [FAKE_WEBHOOK_SIGNATURE_HEADER]: FAKE_WEBHOOK_SIGNATURE },
    queryMap: {},
    rawBody: JSON.stringify(body),
  };
}

type FakeCharge = {
  readonly input: CreateChargeInput;
  readonly created: CreatedCharge;
  status: ChargeStatus;
  paidDatetime: Date | null;
};

type CreateFailure = { remainingSuccessCount: number; code: PaymentGatewayErrorCode };

export type FakeCreateGate = {
  readonly waitForPendingCount: (count: number) => Promise<void>;
  readonly release: () => void;
};

export type FakePaymentGatewayOptions = {
  readonly withQrImage?: boolean;
};

export type FakePaymentGateway = PaymentGateway & {
  readonly createdChargeList: readonly CreatedCharge[];
  readonly createCallCount: number;
  readonly failNextCreate: (code?: PaymentGatewayErrorCode) => void;
  readonly failCreateAfter: (successCount: number, code?: PaymentGatewayErrorCode) => void;
  readonly failNextStatus: (code?: PaymentGatewayErrorCode) => void;
  readonly markPaid: (chargeId: string, paidDatetime?: Date) => void;
  readonly markExpired: (chargeId: string) => void;
  readonly pauseCreate: () => FakeCreateGate;
};

function fakeQrCode({ chargeId, amountCents }: CreateChargeInput): string {
  return `00020126580014br.gov.bcb.pix0136${chargeId}52040000530398654${String(amountCents).padStart(4, "0")}5802BR5913GIZITO TESTE6009SAO PAULO6304FAKE`;
}

function sameInput(left: CreateChargeInput, right: CreateChargeInput): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

const GATE_POLL_INTERVAL_MS = 5;

function createGate(): FakeCreateGate & { readonly enter: () => Promise<void> } {
  let pendingCount = 0;
  let releaseAll: () => void = () => {};
  const released = new Promise<void>((resolve) => {
    releaseAll = resolve;
  });
  return {
    async enter() {
      pendingCount += 1;
      await released;
    },
    async waitForPendingCount(count) {
      while (pendingCount < count) {
        await new Promise((resolve) => setTimeout(resolve, GATE_POLL_INTERVAL_MS));
      }
    },
    release: () => releaseAll(),
  };
}

export function createFakePaymentGateway({
  withQrImage = true,
}: FakePaymentGatewayOptions = {}): FakePaymentGateway {
  const chargeById = new Map<string, FakeCharge>();
  const chargeIdByGatewayOrderId = new Map<string, string>();
  const createdChargeList: CreatedCharge[] = [];
  let createCallCount = 0;
  let createFailure: CreateFailure | null = null;
  let statusFailure: PaymentGatewayErrorCode | null = null;
  let activeCreateGate: ReturnType<typeof createGate> | null = null;

  function takeCreateFailure(): PaymentGatewayErrorCode | null {
    if (createFailure === null) return null;
    if (createFailure.remainingSuccessCount > 0) {
      createFailure.remainingSuccessCount -= 1;
      return null;
    }
    const { code } = createFailure;
    createFailure = null;
    return code;
  }

  function chargeOf(chargeId: string): FakeCharge {
    const charge = chargeById.get(chargeId);
    if (charge === undefined) throw new PaymentGatewayError("gateway_rejected");
    return charge;
  }

  function chargeOfGatewayOrder(gatewayOrderId: string): FakeCharge {
    const chargeId = chargeIdByGatewayOrderId.get(gatewayOrderId);
    if (chargeId === undefined) throw new PaymentGatewayError("gateway_rejected");
    return chargeOf(chargeId);
  }

  return {
    name: "fake",
    createdChargeList,
    get createCallCount() {
      return createCallCount;
    },
    failNextCreate(code = "gateway_unavailable") {
      createFailure = { remainingSuccessCount: 0, code };
    },
    failCreateAfter(successCount, code = "gateway_unavailable") {
      createFailure = { remainingSuccessCount: successCount, code };
    },
    failNextStatus(code = "gateway_unavailable") {
      statusFailure = code;
    },
    markPaid(chargeId, paidDatetime = new Date()) {
      const charge = chargeOf(chargeId);
      charge.status = "paid";
      charge.paidDatetime = paidDatetime;
    },
    markExpired(chargeId) {
      chargeOf(chargeId).status = "expired";
    },
    pauseCreate() {
      const gate = createGate();
      activeCreateGate = gate;
      return {
        waitForPendingCount: gate.waitForPendingCount,
        release() {
          if (activeCreateGate === gate) activeCreateGate = null;
          gate.release();
        },
      };
    },
    async createCharge(rawInput) {
      createCallCount += 1;
      const input = createChargeInputSchema.parse(rawInput);
      await activeCreateGate?.enter();
      const failureCode = takeCreateFailure();
      if (failureCode !== null) throw new PaymentGatewayError(failureCode);
      const existing = chargeById.get(input.chargeId);
      if (existing !== undefined) {
        if (!sameInput(existing.input, input)) throw new PaymentGatewayError("gateway_rejected");
        return existing.created;
      }
      const created: CreatedCharge = {
        gatewayOrderId: fakeGatewayOrderId(input.chargeId),
        gatewayPaymentId: fakeGatewayPaymentId(input.chargeId),
        qrCode: fakeQrCode(input),
        qrCodeBase64: withQrImage ? FAKE_QR_CODE_BASE64 : null,
        ticketUrl: null,
        expireDatetime: input.expireDatetime,
      };
      chargeById.set(input.chargeId, { input, created, status: "pending", paidDatetime: null });
      chargeIdByGatewayOrderId.set(created.gatewayOrderId, input.chargeId);
      createdChargeList.push(created);
      return created;
    },
    async getChargeStatus(reference) {
      if (statusFailure !== null) {
        const code = statusFailure;
        statusFailure = null;
        throw new PaymentGatewayError(code);
      }
      const charge = chargeOfGatewayOrder(reference.gatewayOrderId);
      return {
        status: charge.status,
        gatewayPaymentId: charge.created.gatewayPaymentId,
        amountCents: charge.input.amountCents,
        externalReference: charge.input.orderId,
        paidDatetime: charge.paidDatetime,
      };
    },
    async refund(reference) {
      const charge = chargeOfGatewayOrder(reference.gatewayOrderId);
      if (charge.status !== "paid" && charge.status !== "refunded") {
        throw new PaymentGatewayError("gateway_rejected");
      }
      charge.status = "refunded";
      return { refundId: `fake-refund-${charge.input.chargeId}` };
    },
    async parseWebhook(request) {
      if (request.headerMap[FAKE_WEBHOOK_SIGNATURE_HEADER] !== FAKE_WEBHOOK_SIGNATURE) {
        return { valid: false, reason: "invalid_signature" };
      }
      let body: unknown;
      try {
        body = JSON.parse(request.rawBody);
      } catch {
        return { valid: false, reason: "malformed" };
      }
      const parsed = fakeWebhookBodySchema.safeParse(body);
      if (!parsed.success) return { valid: false, reason: "malformed" };
      return {
        valid: true,
        externalId: `${parsed.data.gatewayOrderId}:${parsed.data.action}`,
        gatewayOrderId: parsed.data.gatewayOrderId,
        gatewayPaymentId: null,
      };
    },
  };
}

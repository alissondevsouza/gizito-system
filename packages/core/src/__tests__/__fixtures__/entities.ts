import type { Charge } from "#src/charge/schemas.ts";
import type { Order, OrderPhoto } from "#src/order/schemas.ts";
import type { Topic } from "#src/pedagogy/taxonomy/schemas.ts";

export const ORDER_ID = "11111111-1111-4111-8111-111111111111";
export const PHOTO_ID = "22222222-2222-4222-8222-222222222222";
export const CHARGE_ID = "33333333-3333-4333-8333-333333333333";
export const KIT_ID = "44444444-4444-4444-8444-444444444444";
export const WEBHOOK_EVENT_ID = "55555555-5555-4555-8555-555555555555";
export const PUBLIC_TOKEN = "Ab3_-cdEfGhIjKlMnOpQrStUvWxYz0123456789abcQ";
export const SHORT_CODE = "GZ-7K3M9Q";
export const FIXED_NOW = new Date("2026-10-15T12:00:00.000Z");

export function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    orderId: ORDER_ID,
    publicToken: PUBLIC_TOKEN,
    shortCode: SHORT_CODE,
    status: "draft",
    grade: "5",
    subject: "math",
    email: null,
    topicIdList: [],
    otherTopicText: null,
    noteText: null,
    perceivedDifficulty: null,
    materialProfile: null,
    analysis: null,
    whatsappPhone: null,
    whatsappConsentDatetime: null,
    paidDatetime: null,
    readyDatetime: null,
    failReasonCode: null,
    insertDatetime: FIXED_NOW,
    updateDatetime: FIXED_NOW,
    ...overrides,
  };
}

export function buildOrderPhoto(overrides: Partial<OrderPhoto> = {}): OrderPhoto {
  return {
    orderPhotoId: PHOTO_ID,
    orderId: ORDER_ID,
    photoIndex: 0,
    storageKey: `photos/${ORDER_ID}/${PHOTO_ID}.jpg`,
    contentHash: "a".repeat(64),
    width: 1600,
    height: 1200,
    legibilityScore: null,
    replacedDatetime: null,
    deleteDatetime: null,
    insertDatetime: FIXED_NOW,
    updateDatetime: FIXED_NOW,
    ...overrides,
  };
}

export function buildCharge(overrides: Partial<Charge> = {}): Charge {
  return {
    chargeId: CHARGE_ID,
    orderId: ORDER_ID,
    gateway: "fake",
    gatewayOrderId: "gw-order-1",
    gatewayPaymentId: null,
    amountCents: 2990,
    status: "pending",
    qrCode: "00020126580014br.gov.bcb.pix",
    qrCodeBase64: "iVBORw0KGgo=",
    ticketUrl: null,
    expireDatetime: new Date("2026-10-15T12:30:00.000Z"),
    paidDatetime: null,
    refundId: null,
    refundDatetime: null,
    insertDatetime: FIXED_NOW,
    updateDatetime: FIXED_NOW,
    ...overrides,
  };
}

export function buildTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    topicId: "ma5-equivalent-fractions",
    grade: "5",
    subject: "math",
    label: "Frações equivalentes",
    description: "Reconhecer e obter frações equivalentes.",
    bnccSkillList: ["EF05MA04"],
    prerequisiteList: [],
    validationRuleList: ["rational_equivalence"],
    ...overrides,
  };
}

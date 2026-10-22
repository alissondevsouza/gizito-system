import { expect } from "bun:test";
import { randomBytes } from "node:crypto";
import {
  KIT_PRICE_CENTS,
  PUBLIC_TOKEN_BYTES,
  SHORT_CODE_ALPHABET,
  SHORT_CODE_LENGTH,
  SHORT_CODE_PREFIX,
} from "@gizito/core";
import type { aiCall, charge, kit, order, orderPhoto } from "#src/schema/index.ts";

export const SQL_STATE = {
  uniqueViolation: "23505",
  foreignKeyViolation: "23503",
  checkViolation: "23514",
  invalidTextRepresentation: "22P02",
} as const;

export const FIXED_DATETIME = new Date("2026-10-15T12:00:00.000Z");

export function randomPublicToken(): string {
  return randomBytes(PUBLIC_TOKEN_BYTES).toString("base64url");
}

export function randomShortCode(): string {
  let code = SHORT_CODE_PREFIX;
  for (const byte of randomBytes(SHORT_CODE_LENGTH)) {
    code += SHORT_CODE_ALPHABET[byte % SHORT_CODE_ALPHABET.length];
  }
  return code;
}

export function buildOrderInsert(
  overrides: Partial<typeof order.$inferInsert> = {},
): typeof order.$inferInsert {
  return {
    publicToken: randomPublicToken(),
    shortCode: randomShortCode(),
    grade: "5",
    subject: "math",
    ...overrides,
  };
}

export function buildOrderPhotoInsert(
  orderId: string,
  overrides: Partial<typeof orderPhoto.$inferInsert> = {},
): typeof orderPhoto.$inferInsert {
  return {
    orderId,
    photoIndex: 0,
    storageKey: `photos/${orderId}/${crypto.randomUUID()}.jpg`,
    contentHash: randomBytes(32).toString("hex"),
    width: 1600,
    height: 1200,
    ...overrides,
  };
}

export function buildChargeInsert(
  orderId: string,
  overrides: Partial<typeof charge.$inferInsert> = {},
): typeof charge.$inferInsert {
  return {
    orderId,
    gateway: "fake",
    amountCents: KIT_PRICE_CENTS,
    qrCode: "00020126580014br.gov.bcb.pix",
    qrCodeBase64: "iVBORw0KGgo=",
    expireDatetime: new Date(FIXED_DATETIME.getTime() + 30 * 60_000),
    ...overrides,
  };
}

export function buildKitInsert(
  orderId: string,
  overrides: Partial<typeof kit.$inferInsert> = {},
): typeof kit.$inferInsert {
  const kitId = crypto.randomUUID();
  return {
    kitId,
    orderId,
    studyKit: { topicIdList: ["fractions"] },
    generationVersion: "gen-test",
    taxonomyVersion: "tax-test",
    activitiesStorageKey: `orders/${orderId}/kits/${kitId}/activities.pdf`,
    answerKeyStorageKey: `orders/${orderId}/kits/${kitId}/answer-key.pdf`,
    pageCountActivities: 6,
    pageCountAnswerKey: 8,
    publishedDatetime: FIXED_DATETIME,
    ...overrides,
  };
}

export function buildAiCallInsert(
  orderId: string,
  overrides: Partial<typeof aiCall.$inferInsert> = {},
): typeof aiCall.$inferInsert {
  return {
    orderId,
    stage: "extract",
    model: "cheap-model",
    promptVersion: "extract-v1",
    inputTokenCount: 1200,
    outputTokenCount: 300,
    costCents: 0.012345,
    durationMs: 850,
    outcomeCode: "ok",
    ...overrides,
  };
}

export async function expectSqlState(promise: Promise<unknown>, sqlState: string): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeDefined();
  const postgresError = ((caught as { cause?: unknown }).cause ?? caught) as { errno?: unknown };
  expect(postgresError.errno).toBe(sqlState);
}

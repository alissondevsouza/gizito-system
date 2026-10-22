import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { createHmac, randomBytes } from "node:crypto";
import {
  type ApiErrorCode,
  apiErrorSchema,
  buildPublicToken,
  buildShortCode,
  KIT_PRICE_CENTS,
  MAX_WEBHOOK_BODY_BYTES,
  type MergedExtraction,
  PUBLIC_TOKEN_BYTES,
  SHORT_CODE_LENGTH,
  WEBHOOK_RATE_LIMIT_PER_MINUTE,
  type WebhookAck,
  type WebhookRequest,
  webhookAckSchema,
} from "@gizito/core";
import { charge, job, order, webhookEvent } from "@gizito/db";
import { createTestDatabase, type TestDatabase, truncateAllTables } from "@gizito/db/test-helpers";
import { createMercadoPagoGateway } from "@gizito/integrations";
import { buildFakeWebhookRequest, createMemoryLogger } from "@gizito/integrations/fakes";
import { eq, sql } from "drizzle-orm";
import { buildAppDependencies, type TestAppDependencies } from "#src/__tests__/__fixtures__/app.ts";
import { createApp } from "#src/app.ts";

let testDatabase: TestDatabase;

beforeAll(async () => {
  testDatabase = await createTestDatabase();
});

afterAll(async () => {
  await testDatabase.destroy();
});

beforeEach(async () => {
  await truncateAllTables(testDatabase.db);
});

const START = new Date("2026-10-22T12:00:00.000Z");
const CLIENT_IP = "203.0.113.10";
const OTHER_CLIENT_IP = "203.0.113.11";
const PAYER_EMAIL = "mae.da.ana@example.com";
const WEBHOOK_SECRET = "segredo-de-teste-do-webhook";
const REAL_GATEWAY_ORDER_ID = "ORD01JP84C939T20S0P1DN382FQ6K";
const REQUEST_ID = "2066ca19-c6f1-498a-be75-1923005edd06";
const SIGNATURE_TS = "1792700000000";

const mergedExtraction: MergedExtraction = {
  photoList: [
    { photoIndex: 1, legibility: "good", isUsable: true, legibilityScore: 1, photoIssueList: [] },
  ],
  topicCandidateList: [{ topicId: "ma5-fractions", confidence: "high", photoIndexList: [1] }],
  unsupportedTopicList: [],
  sourceWarningList: [],
  materialProfile: {
    exerciseFormatList: ["computation"],
    notationList: ["fraction_slash"],
    terminologyList: [],
    contextThemeList: [],
    apparentLevel: "at_grade",
    hasFigures: false,
    isHandwritten: false,
  },
  issueList: [],
};

function setup(overrides: Partial<TestAppDependencies> = {}) {
  const memoryLogger = createMemoryLogger();
  let currentTime = START;
  const dependencies = buildAppDependencies(testDatabase.db, memoryLogger.logger, {
    now: () => currentTime,
    ...overrides,
  });
  return {
    app: createApp(dependencies),
    gateway: dependencies.paymentGateway,
    setTime: (time: Date) => {
      currentTime = time;
    },
    ...memoryLogger,
  };
}

type App = ReturnType<typeof setup>["app"];

async function insertPreviewReadyOrder() {
  const publicToken = buildPublicToken(new Uint8Array(randomBytes(PUBLIC_TOKEN_BYTES)));
  const [row] = await testDatabase.db
    .insert(order)
    .values({
      publicToken,
      shortCode: buildShortCode(new Uint8Array(randomBytes(SHORT_CODE_LENGTH))),
      status: "preview_ready",
      grade: "5",
      subject: "math",
      analysis: {
        outcome: "preview_ready",
        analyzedPhotoIdList: [crypto.randomUUID()],
        mergedExtraction,
      },
    })
    .returning({ orderId: order.orderId });
  if (row === undefined) throw new Error("pedido não gravado");
  return { orderId: row.orderId, publicToken };
}

async function confirmedOrder(app: App) {
  const created = await insertPreviewReadyOrder();
  const response = await app.handle(
    new Request(`http://localhost/orders/${created.publicToken}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        topicIdList: ["ma5-fractions"],
        email: PAYER_EMAIL,
        acceptedTerms: true,
      }),
    }),
  );
  expect(response.status).toBe(200);
  const [chargeRow] = await testDatabase.db
    .select()
    .from(charge)
    .where(eq(charge.orderId, created.orderId));
  if (chargeRow?.gatewayOrderId == null) throw new Error("cobrança não gravada");
  return { ...created, chargeId: chargeRow.chargeId, gatewayOrderId: chargeRow.gatewayOrderId };
}

function webhookHttpRequest(
  { headerMap, queryMap, rawBody }: WebhookRequest,
  {
    clientIp = CLIENT_IP,
    headerOverrideMap = {},
  }: { clientIp?: string; headerOverrideMap?: Record<string, string> } = {},
) {
  const url = new URL("http://localhost/webhooks/mercadopago");
  for (const [key, value] of Object.entries(queryMap)) url.searchParams.set(key, value);
  return new Request(url.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": clientIp,
      ...headerMap,
      ...headerOverrideMap,
    },
    body: rawBody,
  });
}

function fakeWebhook(gatewayOrderId: string, action = "order.processed"): WebhookRequest {
  return buildFakeWebhookRequest({ gatewayOrderId, action });
}

async function postWebhook(app: App, request: Request) {
  return app.handle(request);
}

async function expectAck(response: Response, outcome: WebhookAck["outcome"]) {
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(webhookAckSchema.parse(await response.json())).toEqual({ outcome });
}

async function expectApiError(response: Response, status: number, code: ApiErrorCode) {
  expect(response.status).toBe(status);
  expect(apiErrorSchema.parse(await response.json()).code).toBe(code);
}

async function webhookEventRowList() {
  return testDatabase.db.select().from(webhookEvent);
}

async function reconcileJobList() {
  return testDatabase.db.select().from(job).where(eq(job.name, "charge.reconcile"));
}

function sign(manifest: string): string {
  return createHmac("sha256", WEBHOOK_SECRET).update(manifest).digest("hex");
}

function signedRealWebhook(dataId: string, { tampered = false } = {}): WebhookRequest {
  const manifest = `id:${dataId.toLowerCase()};request-id:${REQUEST_ID};ts:${SIGNATURE_TS};`;
  const v1 = tampered ? sign(`${manifest}x`) : sign(manifest);
  return {
    headerMap: { "X-Signature": `ts=${SIGNATURE_TS},v1=${v1}`, "X-Request-Id": REQUEST_ID },
    queryMap: { "data.id": dataId, type: "order" },
    rawBody: JSON.stringify({
      action: "order.processed",
      type: "order",
      data: { id: dataId, status: "processed" },
    }),
  };
}

async function withFailingJobInsert(run: () => Promise<void>) {
  await testDatabase.db.execute(
    sql.raw(`CREATE FUNCTION fail_job_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'falha forçada no insert do job'; END $$`),
  );
  await testDatabase.db.execute(
    sql.raw(
      "CREATE TRIGGER fail_job_insert BEFORE INSERT ON job FOR EACH ROW EXECUTE FUNCTION fail_job_insert()",
    ),
  );
  try {
    await run();
  } finally {
    await testDatabase.db.execute(sql.raw("DROP TRIGGER fail_job_insert ON job"));
    await testDatabase.db.execute(sql.raw("DROP FUNCTION fail_job_insert()"));
  }
}

describe("POST /webhooks/mercadopago (spec F2-04, RF-08)", () => {
  it("válido registra o webhook_event e enfileira charge.reconcile do pedido e da cobrança na mesma transação", async () => {
    const { app, readEntryList } = setup();
    const confirmed = await confirmedOrder(app);
    const response = await postWebhook(
      app,
      webhookHttpRequest(fakeWebhook(confirmed.gatewayOrderId)),
    );
    await expectAck(response, "queued");
    const [eventRow] = await webhookEventRowList();
    expect(eventRow).toMatchObject({
      source: "mercadopago",
      externalId: `${confirmed.gatewayOrderId}:order.processed`,
      processedDatetime: null,
      outcomeCode: null,
    });
    const jobList = await reconcileJobList();
    expect(jobList.map((row) => row.payload)).toEqual([
      {
        name: "charge.reconcile",
        orderId: confirmed.orderId,
        chargeId: confirmed.chargeId,
        webhookEventId: eventRow?.webhookEventId,
      },
    ]);
    expect(jobList[0]?.status).toBe("pending");
    const received = readEntryList().find((entry) => entry.msg === "webhook recebido");
    expect(received).toMatchObject({
      outcome: "queued",
      orderId: confirmed.orderId,
      chargeId: confirmed.chargeId,
      webhookEventId: eventRow?.webhookEventId,
    });
    expect(typeof received?.durationMs).toBe("number");
  });

  it("o mesmo webhook de novo é duplicate, sem job nem linha nova", async () => {
    const { app } = setup();
    const confirmed = await confirmedOrder(app);
    const request = () => webhookHttpRequest(fakeWebhook(confirmed.gatewayOrderId));
    await expectAck(await postWebhook(app, request()), "queued");
    await expectAck(await postWebhook(app, request()), "duplicate");
    expect(await webhookEventRowList()).toHaveLength(1);
    expect(await reconcileJobList()).toHaveLength(1);
    await expectAck(
      await postWebhook(
        app,
        webhookHttpRequest(fakeWebhook(confirmed.gatewayOrderId, "order.updated")),
      ),
      "queued",
    );
    expect(await webhookEventRowList()).toHaveLength(2);
    expect(await reconcileJobList()).toHaveLength(2);
  });

  it("assinatura inválida dá 401 e corpo que não é JSON dá 400, sem gravar nada", async () => {
    const { app, readEntryList } = setup();
    const confirmed = await confirmedOrder(app);
    const unsigned = fakeWebhook(confirmed.gatewayOrderId);
    await expectApiError(
      await postWebhook(app, webhookHttpRequest({ ...unsigned, headerMap: {} })),
      401,
      "unauthorized",
    );
    await expectApiError(
      await postWebhook(app, webhookHttpRequest({ ...unsigned, rawBody: "{" })),
      400,
      "validation_error",
    );
    expect(await webhookEventRowList()).toEqual([]);
    expect(await reconcileJobList()).toEqual([]);
    expect(
      readEntryList()
        .filter((entry) => entry.msg === "webhook recusado")
        .map((entry) => entry.errorCode),
    ).toEqual(["invalid_signature", "malformed"]);
  });

  it("type diferente de order é ignorado com 200, sem gravar nada", async () => {
    const { app } = setup();
    const confirmed = await confirmedOrder(app);
    const request = fakeWebhook(confirmed.gatewayOrderId);
    await expectAck(
      await postWebhook(app, webhookHttpRequest({ ...request, queryMap: { type: "payment" } })),
      "ignored",
    );
    expect(await webhookEventRowList()).toEqual([]);
  });

  it("order desconhecida registra o evento já processado com charge_not_found e não enfileira", async () => {
    const { app } = setup();
    const unknownGatewayOrderId = `fake-order-${crypto.randomUUID()}`;
    await expectAck(
      await postWebhook(app, webhookHttpRequest(fakeWebhook(unknownGatewayOrderId))),
      "unknown_charge",
    );
    const [eventRow] = await webhookEventRowList();
    expect(eventRow).toMatchObject({
      externalId: `${unknownGatewayOrderId}:order.processed`,
      processedDatetime: START,
      outcomeCode: "charge_not_found",
    });
    expect(await reconcileJobList()).toEqual([]);
    await expectAck(
      await postWebhook(app, webhookHttpRequest(fakeWebhook(unknownGatewayOrderId))),
      "duplicate",
    );
    expect(await webhookEventRowList()).toHaveLength(1);
  });

  it("falha no insert do job desfaz o webhook_event e responde 500", async () => {
    const { app } = setup();
    const confirmed = await confirmedOrder(app);
    await withFailingJobInsert(async () => {
      const response = await postWebhook(
        app,
        webhookHttpRequest(fakeWebhook(confirmed.gatewayOrderId)),
      );
      await expectApiError(response, 500, "internal_error");
    });
    expect(await webhookEventRowList()).toEqual([]);
  });

  it("corpo acima do limite dá 413, com e sem Content-Length", async () => {
    const { app } = setup();
    const confirmed = await confirmedOrder(app);
    const request = fakeWebhook(confirmed.gatewayOrderId);
    await expectApiError(
      await postWebhook(
        app,
        webhookHttpRequest(request, {
          headerOverrideMap: { "content-length": String(MAX_WEBHOOK_BODY_BYTES + 1) },
        }),
      ),
      413,
      "payload_too_large",
    );
    const hugeBody = JSON.stringify({
      gatewayOrderId: confirmed.gatewayOrderId,
      action: "order.processed",
      padding: "x".repeat(MAX_WEBHOOK_BODY_BYTES),
    });
    await expectApiError(
      await postWebhook(app, webhookHttpRequest({ ...request, rawBody: hugeBody })),
      413,
      "payload_too_large",
    );
    expect(await webhookEventRowList()).toEqual([]);
  });

  it("passa do limite por minuto por IP: 429 para o mesmo IP, outro IP passa, o minuto seguinte zera", async () => {
    const { app, setTime } = setup();
    const unsigned = { ...fakeWebhook("fake-order-x"), headerMap: {} };
    for (let count = 0; count < WEBHOOK_RATE_LIMIT_PER_MINUTE; count += 1) {
      expect((await postWebhook(app, webhookHttpRequest(unsigned))).status).toBe(401);
    }
    await expectApiError(await postWebhook(app, webhookHttpRequest(unsigned)), 429, "rate_limited");
    expect(
      (await postWebhook(app, webhookHttpRequest(unsigned, { clientIp: OTHER_CLIENT_IP }))).status,
    ).toBe(401);
    setTime(new Date(START.getTime() + 60_000));
    expect((await postWebhook(app, webhookHttpRequest(unsigned))).status).toBe(401);
  });

  it("com o adaptador real, a assinatura HMAC sobre data.id, x-request-id e ts chega como o Mercado Pago manda", async () => {
    const memoryLogger = createMemoryLogger();
    const realGateway = createMercadoPagoGateway({
      accessToken: "APP_USR-token-de-teste",
      webhookSecret: WEBHOOK_SECRET,
      fetch: (async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
        throw new Error("o webhook não faz IO");
      }) as typeof fetch,
    });
    const app = createApp({
      ...buildAppDependencies(testDatabase.db, memoryLogger.logger, { now: () => START }),
      paymentGateway: realGateway,
    });
    const created = await insertPreviewReadyOrder();
    await testDatabase.db
      .update(order)
      .set({ status: "awaiting_payment", email: PAYER_EMAIL, topicIdList: ["ma5-fractions"] })
      .where(eq(order.orderId, created.orderId));
    const [chargeRow] = await testDatabase.db
      .insert(charge)
      .values({
        orderId: created.orderId,
        gateway: "mercadopago",
        gatewayOrderId: REAL_GATEWAY_ORDER_ID,
        gatewayPaymentId: "PAY01JP84C939T20S0P1DN6FCMWQC",
        amountCents: KIT_PRICE_CENTS,
        qrCode: "00020126580014br.gov.bcb.pix",
        expireDatetime: new Date(START.getTime() + 30 * 60_000),
      })
      .returning({ chargeId: charge.chargeId });
    await expectApiError(
      await postWebhook(
        app,
        webhookHttpRequest(signedRealWebhook(REAL_GATEWAY_ORDER_ID, { tampered: true })),
      ),
      401,
      "unauthorized",
    );
    await expectAck(
      await postWebhook(app, webhookHttpRequest(signedRealWebhook(REAL_GATEWAY_ORDER_ID))),
      "queued",
    );
    const [eventRow] = await webhookEventRowList();
    expect(eventRow?.externalId).toBe(`${REAL_GATEWAY_ORDER_ID}:order.processed`);
    expect((await reconcileJobList()).map((row) => row.payload)).toEqual([
      {
        name: "charge.reconcile",
        orderId: created.orderId,
        chargeId: chargeRow?.chargeId,
        webhookEventId: eventRow?.webhookEventId,
      },
    ]);
  });

  it("os logs nunca levam o corpo, o action solto, a assinatura ou o e-mail", async () => {
    const { app, readEntryList } = setup();
    const confirmed = await confirmedOrder(app);
    const request = fakeWebhook(confirmed.gatewayOrderId, "order.processed.segredo");
    await postWebhook(app, webhookHttpRequest(request));
    await postWebhook(app, webhookHttpRequest({ ...request, headerMap: {} }));
    await postWebhook(app, webhookHttpRequest({ ...request, rawBody: "{nao-json" }));
    await postWebhook(app, webhookHttpRequest(fakeWebhook(`fake-order-${crypto.randomUUID()}`)));
    const logText = JSON.stringify(readEntryList());
    expect(logText).not.toContain(request.rawBody);
    expect(logText).not.toContain("order.processed.segredo");
    expect(logText).not.toContain("x-fake-signature");
    expect(logText).not.toContain(PAYER_EMAIL);
    expect(logText).not.toContain("nao-json");
  });
});

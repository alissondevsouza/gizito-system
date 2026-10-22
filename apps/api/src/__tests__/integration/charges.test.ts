import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { randomBytes } from "node:crypto";
import {
  type ApiErrorCode,
  apiErrorSchema,
  buildPublicToken,
  buildShortCode,
  CHARGE_TTL_MINUTES,
  findTopic,
  KIT_PRICE_CENTS,
  kitPreview,
  type MergedExtraction,
  type OrderStatus,
  orderViewSchema,
  PUBLIC_TOKEN_BYTES,
  SHORT_CODE_LENGTH,
} from "@gizito/core";
import { charge, job, order } from "@gizito/db";
import { createTestDatabase, type TestDatabase, truncateAllTables } from "@gizito/db/test-helpers";
import { createMemoryLogger, FAKE_QR_CODE_BASE64 } from "@gizito/integrations/fakes";
import { asc, eq, sql } from "drizzle-orm";
import { buildAppDependencies, type TestAppDependencies } from "#src/__tests__/__fixtures__/app.ts";
import { createApp } from "#src/app.ts";
import { ORPHAN_CHARGE_LOG_MESSAGE } from "#src/services/charges.ts";
import { CHARGE_MISSING_ERROR_CODE } from "#src/services/orders.ts";

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
const MILLISECONDS_PER_MINUTE = 60_000;
const AFTER_EXPIRE = new Date(START.getTime() + (CHARGE_TTL_MINUTES + 1) * MILLISECONDS_PER_MINUTE);
const PAYER_EMAIL = "mae.da.ana@example.com";
const NOTE_TEXT = "mais dificuldade com frações de bolo";
const WARN_LEVEL = 40;
const ERROR_LEVEL = 50;

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

async function insertOrder(status: OrderStatus = "preview_ready", fieldMap = {}) {
  const publicToken = buildPublicToken(new Uint8Array(randomBytes(PUBLIC_TOKEN_BYTES)));
  const shortCode = buildShortCode(new Uint8Array(randomBytes(SHORT_CODE_LENGTH)));
  const [row] = await testDatabase.db
    .insert(order)
    .values({
      publicToken,
      shortCode,
      status,
      grade: "5",
      subject: "math",
      analysis:
        status === "preview_ready" || status === "draft"
          ? {
              outcome: "preview_ready",
              analyzedPhotoIdList: [crypto.randomUUID()],
              mergedExtraction,
            }
          : null,
      ...fieldMap,
    })
    .returning({ orderId: order.orderId });
  if (row === undefined) throw new Error("pedido não gravado");
  return { orderId: row.orderId, publicToken };
}

const confirmBody = {
  topicIdList: ["ma5-fractions", "ma5-decimal-numbers"],
  otherTopicText: "porcentagem",
  email: "Mae.da.Ana@Example.com",
  noteText: NOTE_TEXT,
  perceivedDifficulty: "basic",
  acceptedTerms: true,
};

async function postConfirm(app: App, token: string, body: unknown = confirmBody) {
  return app.handle(
    new Request(`http://localhost/orders/${token}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function postCharges(app: App, token: string) {
  return app.handle(new Request(`http://localhost/orders/${token}/charges`, { method: "POST" }));
}

async function getOrder(app: App, token: string) {
  return app.handle(new Request(`http://localhost/orders/${token}`));
}

async function expectApiError(response: Response, status: number, code: ApiErrorCode) {
  expect(response.status).toBe(status);
  const body = apiErrorSchema.parse(await response.json());
  expect(body.code).toBe(code);
  return body;
}

async function chargeRowList(orderId: string) {
  return testDatabase.db
    .select()
    .from(charge)
    .where(eq(charge.orderId, orderId))
    .orderBy(asc(charge.insertDatetime), asc(charge.chargeId));
}

async function orderRow(orderId: string) {
  const [row] = await testDatabase.db.select().from(order).where(eq(order.orderId, orderId));
  if (row === undefined) throw new Error("pedido sumiu");
  return row;
}

async function jobRowList(orderId: string) {
  return testDatabase.db.select().from(job).where(sql`${job.payload}->>'orderId' = ${orderId}`);
}

function topicLabel(topicId: string): string {
  const topic = findTopic(topicId);
  if (topic === undefined) throw new Error(`assunto ${topicId} fora da taxonomia`);
  return topic.label;
}

async function confirmedOrder(app: App) {
  const created = await insertOrder();
  const response = await postConfirm(app, created.publicToken);
  expect(response.status).toBe(200);
  return created;
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

describe("POST /orders/:token/confirm (spec F2-03, RF-08)", () => {
  it("confirma, grava os dados, cria a cobrança e enfileira o order_link na mesma transação", async () => {
    const { app, gateway } = setup();
    const created = await insertOrder();
    const response = await postConfirm(app, created.publicToken);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const view = orderViewSchema.parse(await response.json());
    const [chargeRow] = await chargeRowList(created.orderId);
    if (chargeRow === undefined) throw new Error("cobrança não gravada");
    expect(view).toMatchObject({
      status: "awaiting_payment",
      charge: {
        amountCents: KIT_PRICE_CENTS,
        qrCode: chargeRow.qrCode,
        qrCodeBase64: FAKE_QR_CODE_BASE64,
        ticketUrl: null,
        expireDatetime: new Date(
          START.getTime() + CHARGE_TTL_MINUTES * MILLISECONDS_PER_MINUTE,
        ).toISOString(),
      },
      substate: null,
      email: "m***@example.com",
      confirmedTopicList: [
        { topicId: "ma5-fractions", label: topicLabel("ma5-fractions") },
        { topicId: "ma5-decimal-numbers", label: topicLabel("ma5-decimal-numbers") },
      ],
      otherTopicText: "porcentagem",
      kitPreview,
    });

    expect(await orderRow(created.orderId)).toMatchObject({
      status: "awaiting_payment",
      email: "mae.da.ana@example.com",
      topicIdList: ["ma5-fractions", "ma5-decimal-numbers"],
      otherTopicText: "porcentagem",
      noteText: NOTE_TEXT,
      perceivedDifficulty: "basic",
    });
    expect(chargeRow).toMatchObject({
      gateway: "fake",
      gatewayOrderId: `fake-order-${chargeRow.chargeId}`,
      gatewayPaymentId: `fake-payment-${chargeRow.chargeId}`,
      amountCents: KIT_PRICE_CENTS,
      status: "pending",
      qrCodeBase64: FAKE_QR_CODE_BASE64,
    });
    expect(gateway.createCallCount).toBe(1);
    expect(gateway.createdChargeList[0]?.gatewayOrderId).toBe(`fake-order-${chargeRow.chargeId}`);
    expect(gateway.createChargeInputList).toEqual([
      {
        chargeId: chargeRow.chargeId,
        orderId: created.orderId,
        amountCents: KIT_PRICE_CENTS,
        payerEmail: "mae.da.ana@example.com",
        expireDatetime: new Date(START.getTime() + CHARGE_TTL_MINUTES * MILLISECONDS_PER_MINUTE),
      },
    ]);
    expect(
      await gateway.getChargeStatus({
        chargeId: chargeRow.chargeId,
        gatewayOrderId: chargeRow.gatewayOrderId ?? "",
        gatewayPaymentId: chargeRow.gatewayPaymentId,
      }),
    ).toMatchObject({ amountCents: KIT_PRICE_CENTS, externalReference: created.orderId });
    const jobList = await jobRowList(created.orderId);
    expect(jobList.map((row) => row.payload)).toEqual([
      { name: "order.notify", orderId: created.orderId, kind: "order_link" },
    ]);
  });

  it.each<OrderStatus>(["draft", "analyzing", "awaiting_payment", "paid"])(
    "em %s dá 409 sem chamar o gateway",
    async (status) => {
      const { app, gateway } = setup();
      const created = await insertOrder(status, status === "analyzing" ? { analysis: null } : {});
      await expectApiError(await postConfirm(app, created.publicToken), 409, "invalid_state");
      expect(gateway.createCallCount).toBe(0);
      expect(await chargeRowList(created.orderId)).toEqual([]);
    },
  );

  it("confirm repetido depois de confirmado dá 409 e não cria segunda cobrança", async () => {
    const { app, gateway } = setup();
    const created = await confirmedOrder(app);
    await expectApiError(await postConfirm(app, created.publicToken), 409, "invalid_state");
    expect(gateway.createCallCount).toBe(1);
    expect(await chargeRowList(created.orderId)).toHaveLength(1);
  });

  it("assunto de outro ano dá 400 sem chamar o gateway", async () => {
    const { app, gateway } = setup();
    const created = await insertOrder();
    const response = await postConfirm(app, created.publicToken, {
      ...confirmBody,
      topicIdList: ["ma6-numeral-systems"],
    });
    await expectApiError(response, 400, "validation_error");
    expect(gateway.createCallCount).toBe(0);
    expect((await orderRow(created.orderId)).status).toBe("preview_ready");
  });

  it("outro que é assunto ainda não atendido dá 422 com a lista e o texto do design doc", async () => {
    const { app, gateway } = setup();
    const created = await insertOrder();
    const response = await postConfirm(app, created.publicToken, {
      ...confirmBody,
      otherTopicText: "simetria na malha",
    });
    const body = await expectApiError(response, 422, "unsupported_topic");
    expect(body.unsupportedTopicList).toEqual([
      {
        unsupportedTopicId: "ma-grid-symmetry",
        label: "Simetria desenhada em malha",
        reason: "figure",
      },
      expect.objectContaining({ unsupportedTopicId: "ma-grid-scaling" }),
    ]);
    expect(body.error).toBe(
      "Ainda não consigo preparar Simetria desenhada em malha, porque depende de imagem ou de fala.",
    );
    expect(gateway.createCallCount).toBe(0);
  });

  it.each([
    [
      "quatro assuntos",
      { topicIdList: ["ma5-fractions", "ma5-decimal-numbers", "ma5-natural-numbers"] },
    ],
    ["aceite falso", { acceptedTerms: false }],
    ["sem e-mail", { email: undefined }],
    ["e-mail inválido", { email: "mae@" }],
  ])("%s dá 400 validation_error", async (_, change) => {
    const { app, gateway } = setup();
    const created = await insertOrder();
    await expectApiError(
      await postConfirm(app, created.publicToken, { ...confirmBody, ...change }),
      400,
      "validation_error",
    );
    expect(gateway.createCallCount).toBe(0);
  });

  it("token mal formado e token inexistente dão o mesmo 404 neutro", async () => {
    const { app } = setup();
    const malformed = await postConfirm(app, "curto");
    const unknown = await postConfirm(app, "Ab3_-cdEfGhIjKlMnOpQrStUvWxYz0123456789abcQ");
    expect([malformed.status, unknown.status]).toEqual([404, 404]);
    expect(await malformed.json()).toEqual(await unknown.json());
  });

  it("falha do gateway dá 503 e não grava nada", async () => {
    const { app, gateway } = setup();
    const created = await insertOrder();
    gateway.failNextCreate();
    await expectApiError(await postConfirm(app, created.publicToken), 503, "service_unavailable");
    expect((await orderRow(created.orderId)).status).toBe("preview_ready");
    expect(await chargeRowList(created.orderId)).toEqual([]);
    expect(await jobRowList(created.orderId)).toEqual([]);
  });

  it("dois confirm concorrentes: um 200, o outro 409 sem segunda chamada ao gateway", async () => {
    const { app, gateway } = setup();
    const created = await insertOrder();
    const gate = gateway.pauseCreate();
    const first = postConfirm(app, created.publicToken);
    await gate.waitForPendingCount(1);
    await expectApiError(await postConfirm(app, created.publicToken), 409, "invalid_state");
    gate.release();
    expect((await first).status).toBe(200);
    expect(gateway.createCallCount).toBe(1);
    expect(await chargeRowList(created.orderId)).toHaveLength(1);
  });

  it("estado mudado durante a chamada ao gateway dá 409, sem cobrança, com o warn da órfã", async () => {
    const { app, gateway, readEntryList } = setup();
    const created = await insertOrder();
    const gate = gateway.pauseCreate();
    const pending = postConfirm(app, created.publicToken);
    await gate.waitForPendingCount(1);
    await testDatabase.db
      .update(order)
      .set({ status: "draft", analysis: null })
      .where(eq(order.orderId, created.orderId));
    gate.release();
    await expectApiError(await pending, 409, "invalid_state");
    expect(await chargeRowList(created.orderId)).toEqual([]);
    const [orphan] = gateway.createdChargeList;
    expect(readEntryList()).toContainEqual(
      expect.objectContaining({
        level: WARN_LEVEL,
        msg: ORPHAN_CHARGE_LOG_MESSAGE,
        orderId: created.orderId,
        gatewayOrderId: orphan?.gatewayOrderId,
        errorCode: "invalid_state",
      }),
    );
  });

  it("falha no insert do job desfaz tudo, dá 500 e loga a órfã", async () => {
    const { app, readEntryList } = setup();
    const created = await insertOrder();
    await withFailingJobInsert(async () => {
      expect((await postConfirm(app, created.publicToken)).status).toBe(500);
    });
    expect((await orderRow(created.orderId)).status).toBe("preview_ready");
    expect(await chargeRowList(created.orderId)).toEqual([]);
    expect(readEntryList()).toContainEqual(
      expect.objectContaining({
        level: WARN_LEVEL,
        msg: ORPHAN_CHARGE_LOG_MESSAGE,
        orderId: created.orderId,
        errorCode: "internal_error",
      }),
    );
  });

  it("observação e outro com controle são gravados saneados; outro vazio vira nulo", async () => {
    const { app } = setup();
    const created = await insertOrder();
    const response = await postConfirm(app, created.publicToken, {
      ...confirmBody,
      noteText: "mais\u0000 dificuldade‮ com frações",
      otherTopicText: "",
    });
    expect(response.status).toBe(200);
    expect(await orderRow(created.orderId)).toMatchObject({
      noteText: "mais dificuldade com frações",
      otherTopicText: null,
    });
  });
});

describe("POST /orders/:token/charges (spec F2-03, RF-09)", () => {
  it("com o Pix ainda valendo dá 409 charge_active sem chamar o gateway", async () => {
    const { app, gateway } = setup();
    const created = await confirmedOrder(app);
    await expectApiError(await postCharges(app, created.publicToken), 409, "charge_active");
    expect(gateway.createCallCount).toBe(1);
  });

  it("com o Pix vencido cria outra cobrança no mesmo pedido e deixa a antiga pending", async () => {
    const { app, gateway, setTime } = setup();
    const created = await confirmedOrder(app);
    setTime(AFTER_EXPIRE);
    const expiredView = orderViewSchema.parse(
      await (await getOrder(app, created.publicToken)).json(),
    );
    expect(expiredView.status === "awaiting_payment" && expiredView.substate).toBe(
      "charge_expired",
    );

    const response = await postCharges(app, created.publicToken);
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const view = orderViewSchema.parse(await response.json());
    const chargeList = await chargeRowList(created.orderId);
    expect(chargeList.map((row) => row.status)).toEqual(["pending", "pending"]);
    const renewed = chargeList.find((row) => row.qrCode !== chargeList[0]?.qrCode);
    expect(view).toMatchObject({
      status: "awaiting_payment",
      substate: null,
      charge: {
        qrCode: renewed?.qrCode,
        expireDatetime: new Date(
          AFTER_EXPIRE.getTime() + CHARGE_TTL_MINUTES * MILLISECONDS_PER_MINUTE,
        ).toISOString(),
      },
    });
    expect(gateway.createCallCount).toBe(2);
    expect(gateway.createChargeInputList[1]).toEqual({
      chargeId: renewed?.chargeId ?? "",
      orderId: created.orderId,
      amountCents: KIT_PRICE_CENTS,
      payerEmail: "mae.da.ana@example.com",
      expireDatetime: new Date(
        AFTER_EXPIRE.getTime() + CHARGE_TTL_MINUTES * MILLISECONDS_PER_MINUTE,
      ),
    });
    expect(await testDatabase.db.select().from(order)).toHaveLength(1);
    expect((await orderRow(created.orderId)).status).toBe("awaiting_payment");
    expect(await jobRowList(created.orderId)).toHaveLength(1);
  });

  it("duas renovações concorrentes: uma 201, a outra 409 sem segunda chamada, e uma só ativa", async () => {
    const { app, gateway, setTime } = setup();
    const created = await confirmedOrder(app);
    setTime(AFTER_EXPIRE);
    const gate = gateway.pauseCreate();
    const first = postCharges(app, created.publicToken);
    await gate.waitForPendingCount(1);
    await expectApiError(await postCharges(app, created.publicToken), 409, "charge_active");
    gate.release();
    expect((await first).status).toBe(201);
    expect(gateway.createCallCount).toBe(2);
    expect(await chargeRowList(created.orderId)).toHaveLength(2);
  });

  it("pagamento confirmado durante a chamada dá 409, sem cobrança nova, com o warn da órfã", async () => {
    const { app, gateway, setTime, readEntryList } = setup();
    const created = await confirmedOrder(app);
    setTime(AFTER_EXPIRE);
    const gate = gateway.pauseCreate();
    const pending = postCharges(app, created.publicToken);
    await gate.waitForPendingCount(1);
    await testDatabase.db
      .update(order)
      .set({ status: "paid" })
      .where(eq(order.orderId, created.orderId));
    gate.release();
    await expectApiError(await pending, 409, "invalid_state");
    expect(await chargeRowList(created.orderId)).toHaveLength(1);
    expect(readEntryList()).toContainEqual(
      expect.objectContaining({ level: WARN_LEVEL, msg: ORPHAN_CHARGE_LOG_MESSAGE }),
    );
  });

  it("cobrança ativa gravada por outra instância durante a chamada dá 409 charge_active, com o warn da órfã", async () => {
    const { app, gateway, setTime, readEntryList } = setup();
    const created = await confirmedOrder(app);
    setTime(AFTER_EXPIRE);
    const gate = gateway.pauseCreate();
    const pending = postCharges(app, created.publicToken);
    await gate.waitForPendingCount(1);
    const [first] = await chargeRowList(created.orderId);
    if (first === undefined) throw new Error("cobrança não gravada");
    const {
      chargeId: _chargeId,
      insertDatetime: _insert,
      updateDatetime: _update,
      ...copy
    } = first;
    await testDatabase.db.insert(charge).values({
      ...copy,
      gatewayOrderId: "outra-instancia",
      gatewayPaymentId: "outra-instancia-pagamento",
      expireDatetime: new Date(
        AFTER_EXPIRE.getTime() + CHARGE_TTL_MINUTES * MILLISECONDS_PER_MINUTE,
      ),
    });
    gate.release();
    await expectApiError(await pending, 409, "charge_active");
    expect(await chargeRowList(created.orderId)).toHaveLength(2);
    expect(readEntryList()).toContainEqual(
      expect.objectContaining({
        level: WARN_LEVEL,
        msg: ORPHAN_CHARGE_LOG_MESSAGE,
        errorCode: "charge_active",
      }),
    );
  });

  it.each<OrderStatus>(["preview_ready", "paid", "ready"])(
    "em %s dá 409 invalid_state sem chamar o gateway",
    async (status) => {
      const { app, gateway } = setup();
      const created = await insertOrder(status, { email: "mae@example.com" });
      await expectApiError(await postCharges(app, created.publicToken), 409, "invalid_state");
      expect(gateway.createCallCount).toBe(0);
    },
  );

  it("falha do gateway dá 503 e não grava cobrança", async () => {
    const { app, gateway, setTime } = setup();
    const created = await confirmedOrder(app);
    setTime(AFTER_EXPIRE);
    gateway.failNextCreate("gateway_rejected");
    await expectApiError(await postCharges(app, created.publicToken), 503, "service_unavailable");
    expect(await chargeRowList(created.orderId)).toHaveLength(1);
  });
});

describe("GET /orders/:token em awaiting_payment (spec F2-03, RF-10)", () => {
  it("pedido aguardando pagamento sem cobrança dá 500 e loga charge_missing com o orderId", async () => {
    const { app, readEntryList } = setup();
    const created = await insertOrder("awaiting_payment", {
      email: "mae@example.com",
      topicIdList: ["ma5-fractions"],
    });
    expect((await getOrder(app, created.publicToken)).status).toBe(500);
    expect(readEntryList()).toContainEqual(
      expect.objectContaining({
        level: ERROR_LEVEL,
        orderId: created.orderId,
        errorCode: CHARGE_MISSING_ERROR_CODE,
      }),
    );
  });
});

describe("logs da cobrança sem dado pessoal (spec F2-03, RF-13)", () => {
  it("confirm, renovação, 503 e órfã não logam e-mail, QR, token nem observação", async () => {
    const { app, gateway, setTime, lineList } = setup();
    const created = await confirmedOrder(app);
    setTime(AFTER_EXPIRE);
    await postCharges(app, created.publicToken);
    const failing = await insertOrder();
    gateway.failNextCreate();
    await postConfirm(app, failing.publicToken);
    const orphaned = await insertOrder();
    const gate = gateway.pauseCreate();
    const pending = postConfirm(app, orphaned.publicToken);
    await gate.waitForPendingCount(1);
    await testDatabase.db
      .update(order)
      .set({ status: "draft", analysis: null })
      .where(eq(order.orderId, orphaned.orderId));
    gate.release();
    await expectApiError(await pending, 409, "invalid_state");
    const [chargeRow] = await chargeRowList(created.orderId);
    const orphanCharge = gateway.createdChargeList.at(-1);
    const logText = lineList.join("\n");
    expect(logText).toContain(ORPHAN_CHARGE_LOG_MESSAGE);
    for (const secret of [
      PAYER_EMAIL,
      "mae.da.ana",
      created.publicToken,
      failing.publicToken,
      orphaned.publicToken,
      NOTE_TEXT,
      chargeRow?.qrCode ?? "sem-qr",
      orphanCharge?.qrCode ?? "sem-qr-da-orfa",
      FAKE_QR_CODE_BASE64,
    ]) {
      expect(logText).not.toContain(secret);
    }
    expect(logText).toContain(created.orderId);
  });
});

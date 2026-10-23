import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { randomBytes } from "node:crypto";
import {
  buildPublicToken,
  buildShortCode,
  JOB_MAX_ATTEMPT_COUNT,
  kitStorageKey,
  MAX_AI_COST_CENTS_PER_ORDER,
  type OrderStatus,
  PUBLIC_TOKEN_BYTES,
  type ReviewedItemId,
  type ReviewResult,
  SHORT_CODE_LENGTH,
  studyKitSchema,
  TAXONOMY_VERSION,
} from "@gizito/core";
import { FIXTURE_MATERIAL_PROFILE, MATH_TOPIC_REF_LIST } from "@gizito/core/testing";
import {
  aiCall,
  claimJob,
  enqueueJob,
  job,
  kit,
  order,
  recoverExpiredJobs,
  workJob,
} from "@gizito/db";
import { createTestDatabase, type TestDatabase, truncateAllTables } from "@gizito/db/test-helpers";
import { isKatexParsable } from "@gizito/integrations";
import {
  createFakeObjectStorage,
  createMemoryLogger,
  type FakeAiProvider,
  type FakeObjectStorage,
} from "@gizito/integrations/fakes";
import { asc, eq } from "drizzle-orm";
import {
  cleanReviewOf,
  createFixtureAiProvider,
  fixtureOf,
  type KitFixture,
  OTHER_TOPIC_TEXT,
  reviewedItemIdListOf,
} from "#src/__tests__/pipeline/__fixtures__/generation.ts";
import { createCountingRenderer } from "#src/__tests__/pipeline/__fixtures__/pipeline.ts";
import {
  createOrderGenerateJob,
  GENERATION_ABORTED_ERROR_CODE,
  GENERATION_FAILED_LOG_MESSAGE,
  GENERATION_RETRY_LOG_MESSAGE,
  GENERATION_SKIPPED_LOG_MESSAGE,
  KIT_PUBLISHED_LOG_MESSAGE,
  type OrderGenerateDependencies,
  PROVIDER_INCIDENT_LOG_MESSAGE,
  PUBLISH_NO_EFFECT_LOG_MESSAGE,
} from "#src/jobs/order-generate.ts";
import { GENERATION_VERSION } from "#src/pipeline/generate.ts";
import type { PdfRenderer } from "#src/render/pdf-renderer.ts";
import type { JobDefinition } from "#src/runner/lanes.ts";

const WORKER_ID = "worker-test";
const MISSING_ORDER_ID = "99999999-9999-4999-8999-999999999999";
const WARN_LEVEL = 40;
const ERROR_LEVEL = 50;
const ONE_HOUR_MS = 60 * 60 * 1000;

type Harness = {
  readonly fixture: KitFixture;
  readonly provider: FakeAiProvider;
  readonly storage: FakeObjectStorage;
  readonly memoryLogger: ReturnType<typeof createMemoryLogger>;
  readonly renderList: string[];
  readonly definition: JobDefinition;
  readonly dependencies: OrderGenerateDependencies;
};

let testDatabase: TestDatabase;
let harness: Harness;

beforeAll(async () => {
  testDatabase = await createTestDatabase();
});

afterAll(async () => {
  await testDatabase.destroy();
});

beforeEach(async () => {
  await truncateAllTables(testDatabase.db);
  harness = buildHarness();
});

function buildHarness(renderer = createCountingRenderer()): Harness {
  const fixture = fixtureOf("math");
  const provider = createFixtureAiProvider(fixture);
  const storage = createFakeObjectStorage();
  const memoryLogger = createMemoryLogger({ level: "info" });
  const dependencies: OrderGenerateDependencies = {
    db: testDatabase.db,
    aiProvider: provider,
    storage,
    mathEvaluator: fixture.mathEvaluator,
    isMathMarkupParsable: isKatexParsable,
    pdfRenderer: renderer.pdfRenderer,
    logger: memoryLogger.logger,
    now: () => new Date(),
  };
  return {
    fixture,
    provider,
    storage,
    memoryLogger,
    renderList: renderer.renderList,
    dependencies,
    definition: createOrderGenerateJob(dependencies),
  };
}

function definitionWith(override: Partial<OrderGenerateDependencies>): JobDefinition {
  return createOrderGenerateJob({ ...harness.dependencies, ...override });
}

const topicIdList = MATH_TOPIC_REF_LIST.filter((topicRef) => topicRef !== "other");
const hasOtherTopic = MATH_TOPIC_REF_LIST.includes("other");

async function createOrder(
  status: OrderStatus = "paid",
  overrides: Partial<typeof order.$inferInsert> = {},
): Promise<string> {
  const [row] = await testDatabase.db
    .insert(order)
    .values({
      publicToken: buildPublicToken(new Uint8Array(randomBytes(PUBLIC_TOKEN_BYTES))),
      shortCode: buildShortCode(new Uint8Array(randomBytes(SHORT_CODE_LENGTH))),
      status,
      grade: "5",
      subject: "math",
      email: "responsavel@example.com",
      topicIdList,
      otherTopicText: hasOtherTopic ? OTHER_TOPIC_TEXT : null,
      materialProfile: FIXTURE_MATERIAL_PROFILE,
      paidDatetime: new Date(),
      ...overrides,
    })
    .returning({ orderId: order.orderId });
  if (!row) throw new Error("pedido não gravado");
  return row.orderId;
}

async function enqueueGenerate(orderId: string): Promise<string> {
  const enqueued = await enqueueJob(testDatabase.db, { name: "order.generate", orderId });
  return enqueued.jobId;
}

function runGenerate(
  definition: JobDefinition = harness.definition,
  { now = new Date(), maxRunMs }: { now?: Date; maxRunMs?: number } = {},
) {
  return workJob(testDatabase.db, {
    nameList: ["order.generate"],
    workerId: WORKER_ID,
    clock: () => now,
    handler: definition.handle,
    onExhausted: definition.onExhausted,
    maxRunMs,
  });
}

async function loadOrder(orderId: string) {
  const [row] = await testDatabase.db.select().from(order).where(eq(order.orderId, orderId));
  if (!row) throw new Error("pedido não encontrado");
  return row;
}

async function loadKitList(orderId: string) {
  return testDatabase.db.select().from(kit).where(eq(kit.orderId, orderId));
}

async function loadJobList() {
  return testDatabase.db.select().from(job).orderBy(asc(job.insertDatetime));
}

async function loadAiCallList(orderId: string) {
  return testDatabase.db
    .select({ stage: aiCall.stage, outcomeCode: aiCall.outcomeCode, costCents: aiCall.costCents })
    .from(aiCall)
    .where(eq(aiCall.orderId, orderId))
    .orderBy(asc(aiCall.insertDatetime));
}

function stageListOf() {
  return harness.provider.requestList.map((record) => record.stage);
}

function logEntryList(message: string) {
  return harness.memoryLogger.readEntryList().filter((entry) => entry.msg === message);
}

function expectNoKitContentInLogs() {
  const text = harness.memoryLogger.lineList.join("\n");
  const [firstQuestion] = harness.fixture.studyKit.practiceQuestionList;
  if (!firstQuestion) throw new Error("fixture sem questão");
  expect(text).not.toContain(firstQuestion.statement.slice(0, 20));
  expect(text).not.toContain(OTHER_TOPIC_TEXT);
  expect(text).not.toContain("responsavel@example.com");
}

async function expectNothingPublished(orderId: string) {
  expect(await loadKitList(orderId)).toEqual([]);
  expect(harness.storage.objectMap.size).toBe(0);
}

function untilAborted(signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (signal === undefined || signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

function blockedReviewFor(itemIdList: readonly ReviewedItemId[]): ReviewResult {
  const clean = cleanReviewOf(harness.fixture.studyKit, itemIdList);
  return {
    ...clean,
    itemReviewList: clean.itemReviewList.map((review) =>
      review.itemId === "p1"
        ? {
            ...review,
            issueList: [{ code: "answer_incorrect", note: "resposta não bate com o cálculo" }],
          }
        : review,
    ),
  };
}

function alwaysBlockReview(provider: FakeAiProvider = harness.provider) {
  provider.respondWith("review", (request) => ({
    kind: "output",
    output: blockedReviewFor(reviewedItemIdListOf(request)),
  }));
}

describe("order.generate: publicação (spec F2-05, RF-07)", () => {
  it("paid → processing → ready com o kit, os dois PDFs no storage, kit_ready e ai_call", async () => {
    const orderId = await createOrder("paid");
    const jobId = await enqueueGenerate(orderId);
    const outcome = await runGenerate();
    expect(outcome).toMatchObject({ outcome: "completed", jobId, errorCode: null });

    const reloaded = await loadOrder(orderId);
    expect(reloaded.status).toBe("ready");
    expect(reloaded.readyDatetime).not.toBeNull();
    expect(reloaded.failReasonCode).toBeNull();

    const [publishedKit, ...otherKitList] = await loadKitList(orderId);
    expect(otherKitList).toEqual([]);
    if (!publishedKit) throw new Error("kit não gravado");
    expect(publishedKit).toMatchObject({
      generationVersion: GENERATION_VERSION,
      taxonomyVersion: TAXONOMY_VERSION,
      activitiesStorageKey: kitStorageKey(orderId, publishedKit.kitId, "activities"),
      answerKeyStorageKey: kitStorageKey(orderId, publishedKit.kitId, "answer_key"),
      supersededByKitId: null,
    });
    expect(publishedKit.pageCountActivities).toBeGreaterThan(0);
    expect(publishedKit.pageCountAnswerKey).toBeGreaterThan(0);
    expect(studyKitSchema.safeParse(publishedKit.studyKit).success).toBe(true);

    expect([...harness.storage.objectMap.keys()].sort()).toEqual(
      [publishedKit.activitiesStorageKey, publishedKit.answerKeyStorageKey].sort(),
    );
    for (const stored of harness.storage.objectMap.values()) {
      expect(stored.contentType).toBe("application/pdf");
      expect(stored.body.byteLength).toBeGreaterThan(0);
    }
    expect(harness.renderList).toHaveLength(2);

    const jobList = await loadJobList();
    expect(jobList.map((row) => [row.name, row.status])).toEqual([
      ["order.generate", "completed"],
      ["order.notify", "pending"],
    ]);
    expect(jobList[1]?.payload).toEqual({ name: "order.notify", orderId, kind: "kit_ready" });

    const aiCallList = await loadAiCallList(orderId);
    expect(aiCallList.map((row) => [row.stage, row.outcomeCode])).toEqual([
      ["plan", "ok"],
      ["generate", "ok"],
      ["review", "ok"],
    ]);
    expect(aiCallList.every((row) => row.costCents > 0)).toBe(true);

    const [published] = logEntryList(KIT_PUBLISHED_LOG_MESSAGE);
    expect(published).toMatchObject({
      orderId,
      stage: "generate",
      outcome: "ready",
      kitId: publishedKit.kitId,
      aiCallCount: 3,
      repairList: ["initial"],
      pageCountActivities: publishedKit.pageCountActivities,
      pageCountAnswerKey: publishedKit.pageCountAnswerKey,
      warningCodeList: ["page_count_out_of_range"],
    });
    expect(published?.costCents).toBeGreaterThan(0);
    expectNoKitContentInLogs();
  });

  it("em processing retoma sem transição de início e publica", async () => {
    const orderId = await createOrder("processing", { failReasonCode: null });
    await enqueueGenerate(orderId);
    expect((await runGenerate()).outcome).toBe("completed");
    expect((await loadOrder(orderId)).status).toBe("ready");
    expect(await loadKitList(orderId)).toHaveLength(1);
    expect(stageListOf()).toEqual(["plan", "generate", "review"]);
  });

  it.each(["ready", "failed", "awaiting_payment", "refunded"] as const)(
    "reexecução em %s pula sem chamar a IA nem gravar kit",
    async (status) => {
      const orderId = await createOrder(status);
      await enqueueGenerate(orderId);
      expect((await runGenerate()).outcome).toBe("completed");
      expect((await loadOrder(orderId)).status).toBe(status);
      await expectNothingPublished(orderId);
      expect(stageListOf()).toEqual([]);
      expect(await loadAiCallList(orderId)).toEqual([]);
      expect(logEntryList(GENERATION_SKIPPED_LOG_MESSAGE)).toHaveLength(1);
      expect(logEntryList(GENERATION_SKIPPED_LOG_MESSAGE)[0]).toMatchObject({
        orderId,
        status,
        outcome: "skip",
      });
    },
  );

  it("pedido inexistente falha o job sem retry", async () => {
    await enqueueGenerate(MISSING_ORDER_ID);
    expect(await runGenerate()).toMatchObject({ outcome: "failed", errorCode: "order_not_found" });
    expect(stageListOf()).toEqual([]);
  });
});

describe("order.generate: falhas definitivas (spec F2-05, RF-07)", () => {
  it("bloqueador da revisão nas duas tentativas: generation_blocked, failed, kit_failed e job failed", async () => {
    const orderId = await createOrder("paid");
    await enqueueGenerate(orderId);
    alwaysBlockReview();
    expect(await runGenerate()).toMatchObject({
      outcome: "failed",
      errorCode: "generation_blocked",
    });

    const reloaded = await loadOrder(orderId);
    expect(reloaded.status).toBe("failed");
    expect(reloaded.failReasonCode).toBe("generation_blocked");
    expect(reloaded.readyDatetime).toBeNull();
    await expectNothingPublished(orderId);
    expect(harness.renderList).toEqual([]);

    const jobList = await loadJobList();
    expect(jobList.map((row) => [row.name, row.status, row.lastErrorCode])).toEqual([
      ["order.generate", "failed", "generation_blocked"],
      ["order.notify", "pending", null],
    ]);
    expect(jobList[1]?.payload).toEqual({ name: "order.notify", orderId, kind: "kit_failed" });

    expect((await loadAiCallList(orderId)).map((row) => row.stage)).toEqual([
      "plan",
      "generate",
      "review",
      "generate",
      "review",
    ]);
    const [failedEntry] = logEntryList(GENERATION_FAILED_LOG_MESSAGE);
    expect(failedEntry).toMatchObject({
      level: ERROR_LEVEL,
      orderId,
      outcome: "failed",
      errorCode: "generation_blocked",
      repairList: ["initial", "item"],
      aiCallCount: 5,
    });
    expectNoKitContentInLogs();
  });

  it("custo já gasto no teto: ai_cost_exceeded sem nenhuma chamada", async () => {
    const orderId = await createOrder("paid");
    await enqueueGenerate(orderId);
    await testDatabase.db.insert(aiCall).values({
      orderId,
      stage: "extract",
      model: "claude-haiku-5-5",
      promptVersion: "extract-v1",
      inputTokenCount: 1,
      outputTokenCount: 1,
      costCents: MAX_AI_COST_CENTS_PER_ORDER,
      durationMs: 1,
      outcomeCode: "ok",
    });
    expect(await runGenerate()).toMatchObject({ outcome: "failed", errorCode: "ai_cost_exceeded" });
    const reloaded = await loadOrder(orderId);
    expect(reloaded.status).toBe("failed");
    expect(reloaded.failReasonCode).toBe("ai_cost_exceeded");
    expect(stageListOf()).toEqual([]);
    expect(logEntryList(GENERATION_FAILED_LOG_MESSAGE)[0]).toMatchObject({
      spentCostCents: MAX_AI_COST_CENTS_PER_ORDER,
    });
  });

  it("render falhando nas duas tentativas: render_failed e nada no storage", async () => {
    const orderId = await createOrder("paid");
    await enqueueGenerate(orderId);
    const failingRenderer = createCountingRenderer(true);
    const definition = definitionWith({ pdfRenderer: failingRenderer.pdfRenderer });
    expect(await runGenerate(definition)).toMatchObject({
      outcome: "failed",
      errorCode: "render_failed",
    });
    const reloaded = await loadOrder(orderId);
    expect(reloaded.status).toBe("failed");
    expect(reloaded.failReasonCode).toBe("render_failed");
    await expectNothingPublished(orderId);
    expect(failingRenderer.renderList).toHaveLength(4);
    expect(logEntryList(GENERATION_FAILED_LOG_MESSAGE)[0]).toMatchObject({
      errorCode: "render_failed",
      renderIssueCodeList: ["render_failed", "render_failed"],
    });
  });

  it("material_profile nulo é generation_input_invalid, sem chamada", async () => {
    const orderId = await createOrder("paid", { materialProfile: null });
    await enqueueGenerate(orderId);
    expect(await runGenerate()).toMatchObject({
      outcome: "failed",
      errorCode: "generation_input_invalid",
    });
    const reloaded = await loadOrder(orderId);
    expect(reloaded.status).toBe("failed");
    expect(reloaded.failReasonCode).toBe("generation_input_invalid");
    expect(stageListOf()).toEqual([]);
    expect(logEntryList(GENERATION_FAILED_LOG_MESSAGE)[0]).toMatchObject({
      reasonCode: "material_profile_invalid",
    });
  });
});

describe("order.generate: falhas que voltam à fila (spec F2-05, RF-07)", () => {
  it("falha transitória da IA volta à fila com o pedido em processing e a chamada registrada", async () => {
    const orderId = await createOrder("paid");
    await enqueueGenerate(orderId);
    harness.provider.enqueueFailure("plan", "ai_unavailable");
    expect(await runGenerate()).toMatchObject({
      outcome: "retry_scheduled",
      errorCode: "ai_unavailable",
    });
    const reloaded = await loadOrder(orderId);
    expect(reloaded.status).toBe("processing");
    expect(reloaded.failReasonCode).toBeNull();
    await expectNothingPublished(orderId);
    expect((await loadAiCallList(orderId)).map((row) => [row.stage, row.outcomeCode])).toEqual([
      ["plan", "ai_unavailable"],
    ]);
    expect(logEntryList(GENERATION_RETRY_LOG_MESSAGE)[0]).toMatchObject({
      level: WARN_LEVEL,
      outcome: "retry",
      errorCode: "ai_unavailable",
    });
    expect(await loadJobList()).toHaveLength(1);
  });

  it("incidente do provedor volta à fila com log error e o pedido em processing", async () => {
    const orderId = await createOrder("paid");
    await enqueueGenerate(orderId);
    harness.provider.enqueueFailure("plan", "ai_auth_failed");
    expect(await runGenerate()).toMatchObject({
      outcome: "retry_scheduled",
      errorCode: "ai_auth_failed",
    });
    expect((await loadOrder(orderId)).status).toBe("processing");
    const [incident] = logEntryList(PROVIDER_INCIDENT_LOG_MESSAGE);
    expect(incident).toMatchObject({
      level: ERROR_LEVEL,
      orderId,
      outcome: "retry",
      errorCode: "ai_auth_failed",
    });
    expect(logEntryList(GENERATION_FAILED_LOG_MESSAGE)).toEqual([]);
  });

  it("storage indisponível no upload volta à fila e não deixa objeto órfão", async () => {
    const orderId = await createOrder("paid");
    await enqueueGenerate(orderId);
    harness.storage.failPutAfter(1);
    expect(await runGenerate()).toMatchObject({
      outcome: "retry_scheduled",
      errorCode: "storage_unavailable",
    });
    expect((await loadOrder(orderId)).status).toBe("processing");
    await expectNothingPublished(orderId);
    expect(harness.storage.deletedKeyList).toHaveLength(2);
    expect(await loadAiCallList(orderId)).toHaveLength(3);
  });

  it("storage recusando o upload é incidente: volta à fila com log error", async () => {
    const orderId = await createOrder("paid");
    await enqueueGenerate(orderId);
    harness.storage.failNextPut("storage_rejected");
    expect(await runGenerate()).toMatchObject({
      outcome: "retry_scheduled",
      errorCode: "storage_rejected",
    });
    expect(logEntryList(PROVIDER_INCIDENT_LOG_MESSAGE)[0]).toMatchObject({
      level: ERROR_LEVEL,
      errorCode: "storage_rejected",
    });
  });

  it("teto de execução durante uma chamada de IA vira job_timeout com o pedido em processing", async () => {
    const orderId = await createOrder("paid");
    await enqueueGenerate(orderId);
    const definition = definitionWith({
      aiProvider: {
        ...harness.provider,
        plan: async (request) => {
          await untilAborted(request.signal);
          return harness.provider.plan(request);
        },
      },
    });
    expect(await runGenerate(definition, { maxRunMs: 1000 })).toMatchObject({
      outcome: "retry_scheduled",
      errorCode: "job_timeout",
    });
    expect((await loadOrder(orderId)).status).toBe("processing");
    expect(stageListOf()).toEqual(["plan"]);
    expect((await loadAiCallList(orderId)).map((row) => [row.stage, row.outcomeCode])).toEqual([
      ["plan", "ai_aborted"],
    ]);
    await expectNothingPublished(orderId);
    expect((await loadJobList()).map((row) => row.name)).toEqual(["order.generate"]);
  });

  it("teto de execução depois da revisão não renderiza nem publica", async () => {
    const orderId = await createOrder("paid");
    await enqueueGenerate(orderId);
    const definition = definitionWith({
      aiProvider: {
        ...harness.provider,
        review: async (request) => {
          const reviewed = await harness.provider.review(request);
          await untilAborted(request.signal);
          return reviewed;
        },
      },
    });
    expect(await runGenerate(definition, { maxRunMs: 1000 })).toMatchObject({
      outcome: "retry_scheduled",
      errorCode: "job_timeout",
    });
    expect((await loadOrder(orderId)).status).toBe("processing");
    expect(harness.renderList).toEqual([]);
    await expectNothingPublished(orderId);
    expect((await loadAiCallList(orderId)).map((row) => row.outcomeCode)).toEqual([
      "ok",
      "ok",
      "ok",
    ]);
    expect(logEntryList(GENERATION_RETRY_LOG_MESSAGE)[0]).toMatchObject({
      errorCode: GENERATION_ABORTED_ERROR_CODE,
    });
  });
});

describe("order.generate: reembolso durante o processamento (spec F2-05, RF-07)", () => {
  it("publicação recusada apaga os PDFs subidos e termina sem efeito", async () => {
    const orderId = await createOrder("paid");
    await enqueueGenerate(orderId);
    const refundingRenderer: PdfRenderer = {
      async render(document) {
        await testDatabase.db
          .update(order)
          .set({ status: "refunded" })
          .where(eq(order.orderId, orderId));
        return harness.dependencies.pdfRenderer.render(document);
      },
      async close() {},
    };
    const definition = definitionWith({ pdfRenderer: refundingRenderer });
    expect(await runGenerate(definition)).toMatchObject({ outcome: "completed", errorCode: null });
    expect((await loadOrder(orderId)).status).toBe("refunded");
    await expectNothingPublished(orderId);
    expect(harness.storage.deletedKeyList).toHaveLength(2);
    expect((await loadJobList()).map((row) => [row.name, row.status])).toEqual([
      ["order.generate", "completed"],
    ]);
    expect(logEntryList(PUBLISH_NO_EFFECT_LOG_MESSAGE)[0]).toMatchObject({
      level: WARN_LEVEL,
      orderId,
      outcome: "no_effect",
      errorCode: "invalid_transition",
    });
  });

  it("falha definitiva com o pedido já reembolsado termina sem efeito", async () => {
    const orderId = await createOrder("paid");
    await enqueueGenerate(orderId);
    alwaysBlockReview();
    const definition = definitionWith({
      aiProvider: {
        ...harness.provider,
        review: async (request) => {
          await testDatabase.db
            .update(order)
            .set({ status: "refunded" })
            .where(eq(order.orderId, orderId));
          return harness.provider.review(request);
        },
      },
    });
    expect(await runGenerate(definition)).toMatchObject({ outcome: "completed" });
    const reloaded = await loadOrder(orderId);
    expect(reloaded.status).toBe("refunded");
    expect(reloaded.failReasonCode).toBeNull();
    expect((await loadJobList()).map((row) => row.name)).toEqual(["order.generate"]);
    expect(logEntryList(GENERATION_FAILED_LOG_MESSAGE)[0]).toMatchObject({
      level: WARN_LEVEL,
      outcome: "no_effect",
      errorCode: "generation_blocked",
      reasonCode: "invalid_transition",
    });
  });
});

describe("order.generate: esgotamento (spec F2-05, RF-08)", () => {
  it("retentativas esgotadas levam a failed com o código do job e kit_failed", async () => {
    const orderId = await createOrder("paid");
    await enqueueGenerate(orderId);
    for (let attempt = 0; attempt < JOB_MAX_ATTEMPT_COUNT; attempt += 1) {
      harness.provider.enqueueFailure("plan", "ai_unavailable");
    }
    let now = Date.now();
    for (let attempt = 1; attempt < JOB_MAX_ATTEMPT_COUNT; attempt += 1) {
      expect((await runGenerate(harness.definition, { now: new Date(now) })).outcome).toBe(
        "retry_scheduled",
      );
      expect((await loadOrder(orderId)).status).toBe("processing");
      now += ONE_HOUR_MS;
    }
    expect(await runGenerate(harness.definition, { now: new Date(now) })).toMatchObject({
      outcome: "failed",
      errorCode: "ai_unavailable",
    });
    const reloaded = await loadOrder(orderId);
    expect(reloaded.status).toBe("failed");
    expect(reloaded.failReasonCode).toBe("ai_unavailable");
    expect((await loadJobList()).map((row) => [row.name, row.status])).toEqual([
      ["order.generate", "failed"],
      ["order.notify", "pending"],
    ]);
    expect(await loadAiCallList(orderId)).toHaveLength(JOB_MAX_ATTEMPT_COUNT);
  });

  it("lock vencido esgotado na varredura leva a failed com lock_expired", async () => {
    const orderId = await createOrder("paid");
    await enqueueGenerate(orderId);
    const claimed = await claimJob(testDatabase.db, {
      nameList: ["order.generate"],
      workerId: WORKER_ID,
    });
    if (!claimed) throw new Error("job não reclamado");
    await testDatabase.db
      .update(job)
      .set({
        attemptCount: JOB_MAX_ATTEMPT_COUNT,
        lockExpireDatetime: new Date(Date.now() - 1000),
      })
      .where(eq(job.jobId, claimed.jobId));
    const recovered = await recoverExpiredJobs(testDatabase.db, {
      onExhausted: harness.definition.onExhausted,
    });
    expect(recovered.failedCount).toBe(1);
    const reloaded = await loadOrder(orderId);
    expect(reloaded.status).toBe("failed");
    expect(reloaded.failReasonCode).toBe("lock_expired");
    expect((await loadJobList()).map((row) => row.name)).toEqual([
      "order.generate",
      "order.notify",
    ]);
  });

  it("esgotamento com o pedido fora de paid ou processing não muda nada", async () => {
    const orderId = await createOrder("ready");
    const onExhausted = harness.definition.onExhausted;
    if (!onExhausted) throw new Error("order.generate must declare onExhausted");
    await testDatabase.db.transaction((tx) =>
      onExhausted(tx, {
        jobId: crypto.randomUUID(),
        name: "order.generate",
        payload: { name: "order.generate", orderId },
        attemptCount: JOB_MAX_ATTEMPT_COUNT,
        errorCode: "ai_unavailable",
      }),
    );
    const reloaded = await loadOrder(orderId);
    expect(reloaded.status).toBe("ready");
    expect(reloaded.failReasonCode).toBeNull();
    expect(await loadJobList()).toEqual([]);
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { randomBytes } from "node:crypto";
import {
  type AiFailureCode,
  buildPublicToken,
  buildShortCode,
  type Grade,
  JOB_MAX_ATTEMPT_COUNT,
  type OrderAnalysis,
  type OrderStatus,
  orderAnalysisSchema,
  type PhotoExtraction,
  PUBLIC_TOKEN_BYTES,
  photoStorageKey,
  SHORT_CODE_LENGTH,
  type Subject,
} from "@gizito/core";
import {
  aiCall,
  claimJob,
  enqueueSingletonJob,
  extractionCache,
  job,
  order,
  orderPhoto,
  recoverExpiredJobs,
  workJob,
} from "@gizito/db";
import { createTestDatabase, type TestDatabase, truncateAllTables } from "@gizito/db/test-helpers";
import { computeContentHash } from "@gizito/integrations";
import {
  createFakeAiProvider,
  createFakeObjectStorage,
  createMemoryLogger,
  type FakeAiProvider,
  type FakeAiResponse,
  type FakeObjectStorage,
} from "@gizito/integrations/fakes";
import { and, asc, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import {
  failureOf,
  firstMathTopicId,
  outputOf,
  photoExtractionOf,
  secondMathTopicId,
  unreadableExtraction,
} from "#src/__tests__/pipeline/__fixtures__/extraction.ts";
import { createOrderAnalyzeJob } from "#src/jobs/order-analyze.ts";
import type { JobDefinition } from "#src/runner/lanes.ts";

const WORKER_ID = "worker-test";
const EXTRACT_MODEL = "claude-haiku-5-5";
const MISSING_ORDER_ID = "99999999-9999-4999-8999-999999999999";

type PhotoScript = readonly FakeAiResponse[];

type Harness = {
  readonly provider: FakeAiProvider;
  readonly storage: FakeObjectStorage;
  readonly memoryLogger: ReturnType<typeof createMemoryLogger>;
  readonly definition: JobDefinition;
  readonly scriptByHash: Map<string, FakeAiResponse[]>;
};

type CreatedOrder = {
  readonly orderId: string;
  readonly photoIdList: readonly string[];
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
  const provider = createFakeAiProvider({ extractModel: EXTRACT_MODEL });
  const storage = createFakeObjectStorage();
  const memoryLogger = createMemoryLogger({ level: "info" });
  const scriptByHash = new Map<string, FakeAiResponse[]>();
  harness = {
    provider,
    storage,
    memoryLogger,
    scriptByHash,
    definition: createOrderAnalyzeJob({
      db: testDatabase.db,
      aiProvider: provider,
      storage,
      extractModel: EXTRACT_MODEL,
      logger: memoryLogger.logger,
      now: () => new Date(),
    }),
  };
  provider.respondWith("extract", (request) => {
    const data = request.imageList?.[0]?.data;
    const next =
      data === undefined ? undefined : scriptByHash.get(computeContentHash(data))?.shift();
    if (next === undefined) throw new Error("foto sem resposta no roteiro do teste");
    return next;
  });
});

const SYNTHETIC_PHOTO_SIDE_PX = 8;

async function syntheticPhoto(marker: number): Promise<Uint8Array<ArrayBuffer>> {
  const buffer = await sharp({
    create: {
      width: SYNTHETIC_PHOTO_SIDE_PX,
      height: SYNTHETIC_PHOTO_SIDE_PX,
      channels: 3,
      background: { r: (marker * 37) % 256, g: 120, b: 60 },
    },
  })
    .jpeg()
    .toBuffer();
  return new Uint8Array(buffer);
}

async function createOrder(
  photoScriptList: readonly PhotoScript[],
  {
    grade = "5",
    subject = "math",
    storePhotos = true,
  }: { grade?: Grade; subject?: Subject; storePhotos?: boolean } = {},
): Promise<CreatedOrder> {
  const [created] = await testDatabase.db
    .insert(order)
    .values({
      publicToken: buildPublicToken(randomBytes(PUBLIC_TOKEN_BYTES)),
      shortCode: buildShortCode(randomBytes(SHORT_CODE_LENGTH)),
      grade,
      subject,
    })
    .returning({ orderId: order.orderId });
  if (!created) throw new Error("insert returned no row");
  const photoIdList: string[] = [];
  for (const [photoIndex, script] of photoScriptList.entries()) {
    const body = await syntheticPhoto(harness.scriptByHash.size + 1);
    const contentHash = computeContentHash(body);
    harness.scriptByHash.set(contentHash, [...script]);
    const orderPhotoId = crypto.randomUUID();
    const storageKey = photoStorageKey(created.orderId, orderPhotoId);
    if (storePhotos) {
      await harness.storage.putPrivate({ key: storageKey, body, contentType: "image/jpeg" });
    }
    await testDatabase.db.insert(orderPhoto).values({
      orderPhotoId,
      orderId: created.orderId,
      photoIndex,
      storageKey,
      contentHash,
      width: 1600,
      height: 1200,
    });
    photoIdList.push(orderPhotoId);
  }
  await enqueueSingletonJob(
    testDatabase.db,
    { name: "order.analyze", orderId: created.orderId },
    created.orderId,
  );
  return { orderId: created.orderId, photoIdList };
}

function runAnalyze(now: Date = new Date(), definition: JobDefinition = harness.definition) {
  return workJob(testDatabase.db, {
    nameList: ["order.analyze"],
    workerId: WORKER_ID,
    clock: () => now,
    handler: definition.handle,
    onExhausted: definition.onExhausted,
  });
}

function definitionWithStorageHook(beforeGet: () => Promise<unknown>): JobDefinition {
  return createOrderAnalyzeJob({
    db: testDatabase.db,
    aiProvider: harness.provider,
    storage: {
      ...harness.storage,
      get: async (key) => {
        await beforeGet();
        return harness.storage.get(key);
      },
    },
    extractModel: EXTRACT_MODEL,
    logger: harness.memoryLogger.logger,
    now: () => new Date(),
  });
}

async function loadOrder(orderId: string) {
  const [row] = await testDatabase.db.select().from(order).where(eq(order.orderId, orderId));
  if (!row) throw new Error("order not found");
  return {
    ...row,
    analysis: row.analysis === null ? null : orderAnalysisSchema.parse(row.analysis),
  };
}

async function loadAnalyzeJobList(orderId: string) {
  return testDatabase.db
    .select()
    .from(job)
    .where(sql`${job.payload}->>'orderId' = ${orderId}`)
    .orderBy(asc(job.insertDatetime));
}

async function countAiCalls(orderId: string) {
  const rowList = await testDatabase.db
    .select({ outcomeCode: aiCall.outcomeCode })
    .from(aiCall)
    .where(eq(aiCall.orderId, orderId));
  return rowList.map((row) => row.outcomeCode).sort();
}

async function loadLegibilityList(orderId: string) {
  const rowList = await testDatabase.db
    .select({ legibilityScore: orderPhoto.legibilityScore })
    .from(orderPhoto)
    .where(eq(orderPhoto.orderId, orderId))
    .orderBy(asc(orderPhoto.photoIndex));
  return rowList.map((row) => row.legibilityScore);
}

function extractCallCount() {
  return harness.provider.requestList.filter((record) => record.stage === "extract").length;
}

async function runAnalyzeAndProbeHandoff(definition: JobDefinition = harness.definition) {
  const probe = { enqueuedBeforeCompleteJob: false };
  const outcome = await workJob(testDatabase.db, {
    nameList: ["order.analyze"],
    workerId: WORKER_ID,
    handler: async (claimedJob, context) => {
      const result = await definition.handle(claimedJob, context);
      if (claimedJob.payload.name === "order.analyze") {
        const { orderId } = claimedJob.payload;
        const enqueued = await enqueueSingletonJob(
          testDatabase.db,
          { name: "order.analyze", orderId },
          orderId,
        );
        probe.enqueuedBeforeCompleteJob = enqueued !== null;
      }
      return result;
    },
    onExhausted: definition.onExhausted,
  });
  return { outcome, ...probe };
}

async function stealLease(orderId: string) {
  await testDatabase.db
    .update(job)
    .set({ attemptCount: sql`${job.attemptCount} + 1`, lockedBy: "outro-worker" })
    .where(and(eq(job.status, "active"), sql`${job.payload}->>'orderId' = ${orderId}`));
}

function failureScript(code: AiFailureCode): PhotoScript {
  return [failureOf(code)];
}

function onlyOutput(extraction: PhotoExtraction): PhotoScript {
  return [outputOf(extraction)];
}

describe("order.analyze: desfechos da prévia (spec F2-02, RF-07)", () => {
  it("prévia pronta: preview_ready com análise, perfil, legibilidade, ai_call e job concluído", async () => {
    const created = await createOrder([
      onlyOutput(photoExtractionOf()),
      onlyOutput(
        photoExtractionOf({
          legibility: "partial",
          topicCandidateList: [
            {
              topicId: secondMathTopicId,
              confidence: "medium",
              evidence: "segunda página com contas do assunto",
            },
          ],
        }),
      ),
    ]);
    const { outcome, enqueuedBeforeCompleteJob } = await runAnalyzeAndProbeHandoff();
    expect(outcome).toMatchObject({ outcome: "completed", errorCode: null });
    expect(enqueuedBeforeCompleteJob).toBe(true);

    const reloaded = await loadOrder(created.orderId);
    expect(reloaded.status).toBe("preview_ready");
    expect(reloaded.analysis?.outcome).toBe("preview_ready");
    if (reloaded.analysis?.outcome !== "preview_ready") throw new Error("expected preview");
    expect(reloaded.analysis.analyzedPhotoIdList).toEqual([...created.photoIdList]);
    expect(
      reloaded.analysis.mergedExtraction.topicCandidateList.map((item) => item.topicId),
    ).toEqual([firstMathTopicId, secondMathTopicId]);
    expect(reloaded.materialProfile).toEqual(reloaded.analysis.mergedExtraction.materialProfile);
    expect(await loadLegibilityList(created.orderId)).toEqual([1, 0.5]);
    expect(await countAiCalls(created.orderId)).toEqual(["ok", "ok"]);
    expect((await loadAnalyzeJobList(created.orderId)).map((row) => row.status)).toEqual([
      "completed",
      "pending",
    ]);

    const entry = harness.memoryLogger
      .readEntryList()
      .find((item) => item.msg === "análise concluída");
    expect(entry).toMatchObject({
      orderId: created.orderId,
      stage: "analyze",
      outcome: "preview_ready",
      status: "preview_ready",
      aiCallCount: 2,
    });
    expect(entry?.costCents).toBeGreaterThan(0);
    const serializedLog = JSON.stringify(harness.memoryLogger.readEntryList());
    expect(serializedLog).not.toContain("contas do assunto");
    expect(serializedLog).not.toContain("compras no mercado");
  });

  it.each<[string, PhotoExtraction, string, boolean]>([
    ["foto ilegível", unreadableExtraction, "photos_unreadable", false],
    [
      "só assunto não atendido",
      photoExtractionOf({ topicCandidateList: [], unsupportedTopicIdList: ["ma-grid-symmetry"] }),
      "only_unsupported_topics",
      false,
    ],
    ["nenhum assunto", photoExtractionOf({ topicCandidateList: [] }), "no_topic_found", false],
    [
      "matéria de outra disciplina",
      photoExtractionOf({ topicCandidateList: [], sourceWarningCodeList: ["subject_mismatch"] }),
      "no_topic_found",
      true,
    ],
  ])("%s volta a draft com o aviso", async (_label, extraction, failCode, isMaterialMismatch) => {
    const created = await createOrder([onlyOutput(extraction)]);
    const { outcome, enqueuedBeforeCompleteJob } = await runAnalyzeAndProbeHandoff();
    expect(outcome.outcome).toBe("completed");
    expect(enqueuedBeforeCompleteJob).toBe(true);
    const reloaded = await loadOrder(created.orderId);
    expect(reloaded.status).toBe("draft");
    expect(reloaded.analysis).toMatchObject({
      outcome: "analysis_failed",
      failCode,
      isMaterialMismatch,
    });
    expect(reloaded.materialProfile).toBeNull();
  });
});

describe("order.analyze: falhas (spec F2-02, RF-07)", () => {
  it("falha transitória fica em analyzing e a retentativa usa o cache da foto já lida", async () => {
    const created = await createOrder([
      onlyOutput(photoExtractionOf()),
      [failureOf("ai_rate_limited"), outputOf(photoExtractionOf())],
    ]);
    const firstRun = await runAnalyze();
    expect(firstRun).toMatchObject({ outcome: "retry_scheduled", errorCode: "ai_rate_limited" });
    const waiting = await loadOrder(created.orderId);
    expect(waiting.status).toBe("analyzing");
    expect(waiting.analysis).toBeNull();
    expect(await countAiCalls(created.orderId)).toEqual(["ai_rate_limited", "ok"]);
    const cachedRowList = await testDatabase.db.select().from(extractionCache);
    expect(cachedRowList).toHaveLength(1);

    const secondRun = await runAnalyze(new Date(Date.now() + 60 * 60 * 1000));
    expect(secondRun.outcome).toBe("completed");
    expect((await loadOrder(created.orderId)).status).toBe("preview_ready");
    expect(extractCallCount()).toBe(3);
    expect(await countAiCalls(created.orderId)).toEqual(["ai_rate_limited", "ok", "ok"]);
  });

  it("falha que não volta à fila encerra em analysis_unavailable e conclui o job", async () => {
    const created = await createOrder([failureScript("ai_auth_failed")]);
    const { outcome, enqueuedBeforeCompleteJob } = await runAnalyzeAndProbeHandoff();
    expect(outcome.outcome).toBe("completed");
    expect(enqueuedBeforeCompleteJob).toBe(true);
    const reloaded = await loadOrder(created.orderId);
    expect(reloaded.status).toBe("draft");
    expect(reloaded.analysis).toEqual({ outcome: "analysis_unavailable" });
    expect(await countAiCalls(created.orderId)).toEqual(["ai_auth_failed"]);
    const entry = harness.memoryLogger
      .readEntryList()
      .find((item) => item.msg === "análise indisponível");
    expect(entry).toMatchObject({ orderId: created.orderId, errorCode: "ai_auth_failed" });
  });

  it("storage indisponível volta à fila sem chamar a IA", async () => {
    const created = await createOrder([onlyOutput(photoExtractionOf())]);
    harness.storage.failNextGet("storage_unavailable");
    expect(await runAnalyze()).toMatchObject({
      outcome: "retry_scheduled",
      errorCode: "storage_unavailable",
    });
    expect((await loadOrder(created.orderId)).status).toBe("analyzing");
    expect(extractCallCount()).toBe(0);
  });

  it("foto ausente no storage encerra em analysis_unavailable", async () => {
    const created = await createOrder([onlyOutput(photoExtractionOf())], { storePhotos: false });
    expect((await runAnalyze()).outcome).toBe("completed");
    expect((await loadOrder(created.orderId)).analysis).toEqual({
      outcome: "analysis_unavailable",
    });
    expect(extractCallCount()).toBe(0);
  });

  it("pedido sem foto atual encerra em analysis_unavailable", async () => {
    const created = await createOrder([]);
    expect((await runAnalyze()).outcome).toBe("completed");
    expect((await loadOrder(created.orderId)).analysis).toEqual({
      outcome: "analysis_unavailable",
    });
  });

  it("pedido inexistente falha o job sem retry", async () => {
    await enqueueSingletonJob(
      testDatabase.db,
      { name: "order.analyze", orderId: MISSING_ORDER_ID },
      MISSING_ORDER_ID,
    );
    expect(await runAnalyze()).toMatchObject({ outcome: "failed", errorCode: "order_not_found" });
  });
});

describe("order.analyze: reexecução e corridas (spec F2-02, RF-04 e RF-05)", () => {
  it.each<[string, PhotoExtraction, OrderStatus]>([
    ["draft já analisado", unreadableExtraction, "draft"],
    ["preview_ready", photoExtractionOf(), "preview_ready"],
  ])(
    "%s é pulado sem IA, e o job concluído na transação do início",
    async (_label, extraction, status) => {
      const created = await createOrder([onlyOutput(extraction)]);
      await runAnalyze();
      expect((await loadOrder(created.orderId)).status).toBe(status);
      const calledBefore = extractCallCount();
      await enqueueSingletonJob(
        testDatabase.db,
        { name: "order.analyze", orderId: created.orderId },
        created.orderId,
      );
      const { outcome, enqueuedBeforeCompleteJob } = await runAnalyzeAndProbeHandoff();
      expect(outcome.outcome).toBe("completed");
      expect(enqueuedBeforeCompleteJob).toBe(true);
      expect(extractCallCount()).toBe(calledBefore);
      expect((await loadOrder(created.orderId)).status).toBe(status);
      const entry = harness.memoryLogger
        .readEntryList()
        .find((item) => item.msg === "análise pulada");
      expect(entry).toMatchObject({ orderId: created.orderId, status, outcome: "skip" });
    },
  );

  it("lease roubado durante a análise desfaz o fim: lease_lost, pedido em analyzing e análise nula", async () => {
    const created = await createOrder([onlyOutput(photoExtractionOf())]);
    const definition = definitionWithStorageHook(() => stealLease(created.orderId));
    expect(await runAnalyze(new Date(), definition)).toMatchObject({ outcome: "lease_lost" });
    const reloaded = await loadOrder(created.orderId);
    expect(reloaded.status).toBe("analyzing");
    expect(reloaded.analysis).toBeNull();
    expect(reloaded.materialProfile).toBeNull();
    expect(await loadLegibilityList(created.orderId)).toEqual([null]);
    const [stolen] = await loadAnalyzeJobList(created.orderId);
    expect(stolen).toMatchObject({ status: "active", lockedBy: "outro-worker" });
  });

  it("foto trocada por fora durante a análise volta à fila sem gravar", async () => {
    const created = await createOrder([onlyOutput(photoExtractionOf())]);
    const definition = definitionWithStorageHook(() =>
      testDatabase.db
        .update(orderPhoto)
        .set({ replacedDatetime: new Date() })
        .where(eq(orderPhoto.orderId, created.orderId)),
    );
    const outcome = await runAnalyze(new Date(), definition);
    expect(outcome).toMatchObject({
      outcome: "retry_scheduled",
      errorCode: "analysis_photo_set_changed",
    });
    const reloaded = await loadOrder(created.orderId);
    expect(reloaded.status).toBe("analyzing");
    expect(reloaded.analysis).toBeNull();
    expect(await loadLegibilityList(created.orderId)).toEqual([null]);
  });

  it("pedido que saiu de analyzing durante a análise termina sem efeito", async () => {
    const created = await createOrder([onlyOutput(photoExtractionOf())]);
    const definition = definitionWithStorageHook(() =>
      testDatabase.db
        .update(order)
        .set({ status: "draft", analysis: { outcome: "analysis_unavailable" } })
        .where(eq(order.orderId, created.orderId)),
    );
    expect((await runAnalyze(new Date(), definition)).outcome).toBe("completed");
    const reloaded = await loadOrder(created.orderId);
    expect(reloaded.status).toBe("draft");
    expect(reloaded.analysis).toEqual({ outcome: "analysis_unavailable" });
    const entry = harness.memoryLogger.readEntryList().find((item) => item.outcome === "no_effect");
    expect(entry).toMatchObject({ orderId: created.orderId, errorCode: "invalid_transition" });
  });
});

describe("order.analyze: esgotamento (spec F2-02, RF-08)", () => {
  it("retentativas esgotadas levam a draft com analysis_unavailable", async () => {
    const created = await createOrder([
      Array.from({ length: JOB_MAX_ATTEMPT_COUNT }, () => failureOf("ai_unavailable")),
    ]);
    let now = Date.now();
    for (let attempt = 1; attempt < JOB_MAX_ATTEMPT_COUNT; attempt += 1) {
      expect((await runAnalyze(new Date(now))).outcome).toBe("retry_scheduled");
      now += 60 * 60 * 1000;
    }
    expect(await runAnalyze(new Date(now))).toMatchObject({
      outcome: "failed",
      errorCode: "ai_unavailable",
    });
    const reloaded = await loadOrder(created.orderId);
    expect(reloaded.status).toBe("draft");
    expect(reloaded.analysis).toEqual({ outcome: "analysis_unavailable" });
    const enqueuedAfterCompensation = await enqueueSingletonJob(
      testDatabase.db,
      { name: "order.analyze", orderId: created.orderId },
      created.orderId,
    );
    expect(enqueuedAfterCompensation).not.toBeNull();
  });

  it("lock vencido esgotado na varredura também leva a analysis_unavailable", async () => {
    const created = await createOrder([onlyOutput(photoExtractionOf())]);
    await testDatabase.db
      .update(order)
      .set({ status: "analyzing" })
      .where(eq(order.orderId, created.orderId));
    const claimed = await claimJob(testDatabase.db, {
      nameList: ["order.analyze"],
      workerId: WORKER_ID,
    });
    if (!claimed) throw new Error("job not claimed");
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
    const reloaded = await loadOrder(created.orderId);
    expect(reloaded.status).toBe("draft");
    expect(reloaded.analysis).toEqual({ outcome: "analysis_unavailable" } satisfies OrderAnalysis);
  });

  it("esgotamento com o pedido fora de analyzing não muda nada", async () => {
    const created = await createOrder([onlyOutput(photoExtractionOf())]);
    const onExhausted = harness.definition.onExhausted;
    if (!onExhausted) throw new Error("order.analyze must declare onExhausted");
    await testDatabase.db.transaction((tx) =>
      onExhausted(tx, {
        jobId: crypto.randomUUID(),
        name: "order.analyze",
        payload: { name: "order.analyze", orderId: created.orderId },
        attemptCount: JOB_MAX_ATTEMPT_COUNT,
        errorCode: "ai_unavailable",
      }),
    );
    const reloaded = await loadOrder(created.orderId);
    expect(reloaded.status).toBe("draft");
    expect(reloaded.analysis).toBeNull();
  });
});

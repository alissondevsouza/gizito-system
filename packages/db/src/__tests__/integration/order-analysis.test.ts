import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  InvalidTransitionError,
  type OrderAnalysis,
  type OrderStatus,
  unavailableOrderAnalysis,
} from "@gizito/core";
import { asc, eq } from "drizzle-orm";
import {
  buildOrderInsert,
  buildOrderPhotoInsert,
  buildPreviewReadyAnalysis,
  expectSqlState,
  SQL_STATE,
} from "#src/__tests__/integration/helpers.ts";
import { finishOrderAnalysis, recordAiCallList, startOrderAnalysis } from "#src/order/analysis.ts";
import { AnalysisPhotoSetChangedError, OrderNotFoundError } from "#src/order/errors.ts";
import { aiCall, order, orderPhoto } from "#src/schema/index.ts";
import {
  createTestDatabase,
  type TestDatabase,
  truncateAllTables,
} from "#src/test-helpers/index.ts";

const MISSING_ORDER_ID = "99999999-9999-4999-8999-999999999999";

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

async function insertOrder(overrides: Partial<typeof order.$inferInsert> = {}) {
  const [row] = await testDatabase.db.insert(order).values(buildOrderInsert(overrides)).returning();
  if (!row) throw new Error("insert returned no row");
  return row;
}

async function insertPhoto(orderId: string, photoIndex: number) {
  const [row] = await testDatabase.db
    .insert(orderPhoto)
    .values(buildOrderPhotoInsert(orderId, { photoIndex }))
    .returning();
  if (!row) throw new Error("insert returned no row");
  return row;
}

async function loadOrder(orderId: string) {
  const [row] = await testDatabase.db.select().from(order).where(eq(order.orderId, orderId));
  if (!row) throw new Error("order not found");
  return row;
}

async function loadPhotoList(orderId: string) {
  return testDatabase.db
    .select()
    .from(orderPhoto)
    .where(eq(orderPhoto.orderId, orderId))
    .orderBy(asc(orderPhoto.photoIndex));
}

function start(orderId: string) {
  return testDatabase.db.transaction((tx) => startOrderAnalysis(tx, orderId));
}

function finish(orderId: string, analysis: OrderAnalysis) {
  return testDatabase.db.transaction((tx) => finishOrderAnalysis(tx, { orderId, analysis }));
}

function twoPhotoAnalysis(
  firstPhotoId: string,
  secondPhotoId: string,
  overrides: Partial<OrderAnalysis> = {},
): OrderAnalysis {
  const preview = buildPreviewReadyAnalysis(firstPhotoId);
  if (preview.outcome !== "preview_ready") throw new Error("fixture must be preview_ready");
  return {
    ...preview,
    analyzedPhotoIdList: [firstPhotoId, secondPhotoId],
    mergedExtraction: {
      ...preview.mergedExtraction,
      photoList: [
        ...preview.mergedExtraction.photoList,
        {
          photoIndex: 2,
          legibility: "partial",
          isUsable: true,
          legibilityScore: 0.5,
          photoIssueList: ["glare"],
        },
      ],
    },
    ...overrides,
  } as OrderAnalysis;
}

describe("startOrderAnalysis (spec F2-02, RF-04)", () => {
  it("draft sem análise vira analyzing e devolve as fotos atuais por photo_index", async () => {
    const created = await insertOrder({ grade: "6", subject: "portuguese" });
    const second = await insertPhoto(created.orderId, 1);
    const first = await insertPhoto(created.orderId, 0);
    const replaced = await insertPhoto(created.orderId, 2);
    await testDatabase.db
      .update(orderPhoto)
      .set({ replacedDatetime: new Date() })
      .where(eq(orderPhoto.orderPhotoId, replaced.orderPhotoId));

    const started = await start(created.orderId);
    expect(started).toEqual({
      ok: true,
      value: {
        decision: "start",
        grade: "6",
        subject: "portuguese",
        photoList: [
          {
            orderPhotoId: first.orderPhotoId,
            storageKey: first.storageKey,
            insertDatetime: first.insertDatetime,
          },
          {
            orderPhotoId: second.orderPhotoId,
            storageKey: second.storageKey,
            insertDatetime: second.insertDatetime,
          },
        ],
      },
    });
    expect((await loadOrder(created.orderId)).status).toBe("analyzing");
  });

  it("analyzing é retomado, sem nova transição, e relê as fotos", async () => {
    const created = await insertOrder({ status: "analyzing" });
    const photo = await insertPhoto(created.orderId, 0);
    const started = await start(created.orderId);
    if (!started.ok || started.value.decision === "skip") throw new Error("expected resume");
    expect(started.value.decision).toBe("resume");
    expect(started.value.photoList.map((item) => item.orderPhotoId)).toEqual([photo.orderPhotoId]);
    expect((await loadOrder(created.orderId)).status).toBe("analyzing");
  });

  it.each<[string, Partial<typeof order.$inferInsert>, OrderStatus]>([
    ["draft já analisado", { analysis: unavailableOrderAnalysis }, "draft"],
    ["preview_ready", { status: "preview_ready" }, "preview_ready"],
    [
      "awaiting_payment",
      { status: "awaiting_payment", topicIdList: ["ma5-fractions"] },
      "awaiting_payment",
    ],
  ])("%s é pulado sem escrita", async (_label, overrides, status) => {
    const created = await insertOrder(overrides);
    expect(await start(created.orderId)).toEqual({ ok: true, value: { decision: "skip", status } });
    const reloaded = await loadOrder(created.orderId);
    expect(reloaded.status).toBe(status);
    expect(reloaded.updateDatetime.getTime()).toBe(created.updateDatetime.getTime());
  });

  it("pedido inexistente devolve OrderNotFoundError", async () => {
    const started = await start(MISSING_ORDER_ID);
    expect(started.ok).toBe(false);
    if (!started.ok) expect(started.error).toBeInstanceOf(OrderNotFoundError);
  });
});

describe("finishOrderAnalysis (spec F2-02, RF-03 e RF-05)", () => {
  it("prévia pronta grava análise, perfil e legibilidade de cada foto", async () => {
    const created = await insertOrder({ status: "analyzing" });
    const first = await insertPhoto(created.orderId, 0);
    const second = await insertPhoto(created.orderId, 1);
    const analysis = twoPhotoAnalysis(first.orderPhotoId, second.orderPhotoId);

    expect(await finish(created.orderId, analysis)).toEqual({ ok: true, value: "preview_ready" });
    const reloaded = await loadOrder(created.orderId);
    expect(reloaded.status).toBe("preview_ready");
    expect(reloaded.analysis).toEqual(analysis);
    if (analysis.outcome !== "preview_ready") throw new Error("fixture must be preview_ready");
    expect(reloaded.materialProfile).toEqual(analysis.mergedExtraction.materialProfile);
    expect((await loadPhotoList(created.orderId)).map((photo) => photo.legibilityScore)).toEqual([
      1, 0.5,
    ]);
  });

  it("falha da prévia volta a draft com a análise e sem perfil", async () => {
    const created = await insertOrder({ status: "analyzing" });
    const first = await insertPhoto(created.orderId, 0);
    const second = await insertPhoto(created.orderId, 1);
    const preview = twoPhotoAnalysis(first.orderPhotoId, second.orderPhotoId);
    if (preview.outcome !== "preview_ready") throw new Error("fixture must be preview_ready");
    const failed: OrderAnalysis = {
      outcome: "analysis_failed",
      failCode: "no_topic_found",
      isMaterialMismatch: true,
      analyzedPhotoIdList: preview.analyzedPhotoIdList,
      mergedExtraction: { ...preview.mergedExtraction, topicCandidateList: [] },
    };

    expect(await finish(created.orderId, failed)).toEqual({ ok: true, value: "draft" });
    const reloaded = await loadOrder(created.orderId);
    expect(reloaded.status).toBe("draft");
    expect(reloaded.analysis).toEqual(failed);
    expect(reloaded.materialProfile).toBeNull();
    expect((await loadPhotoList(created.orderId)).map((photo) => photo.legibilityScore)).toEqual([
      1, 0.5,
    ]);
  });

  it("análise indisponível volta a draft sem tocar nas fotos", async () => {
    const created = await insertOrder({ status: "analyzing" });
    await insertPhoto(created.orderId, 0);
    expect(await finish(created.orderId, unavailableOrderAnalysis)).toEqual({
      ok: true,
      value: "draft",
    });
    const reloaded = await loadOrder(created.orderId);
    expect(reloaded.analysis).toEqual(unavailableOrderAnalysis);
    expect((await loadPhotoList(created.orderId))[0]?.legibilityScore).toBeNull();
  });

  it("fotos atuais diferentes das analisadas devolvem erro sem gravar", async () => {
    const created = await insertOrder({ status: "analyzing" });
    const first = await insertPhoto(created.orderId, 0);
    const second = await insertPhoto(created.orderId, 1);
    for (const analysis of [
      twoPhotoAnalysis(second.orderPhotoId, first.orderPhotoId),
      buildPreviewReadyAnalysis(first.orderPhotoId),
    ]) {
      const finished = await finish(created.orderId, analysis);
      expect(finished.ok).toBe(false);
      if (!finished.ok) expect(finished.error).toBeInstanceOf(AnalysisPhotoSetChangedError);
    }
    const reloaded = await loadOrder(created.orderId);
    expect(reloaded.status).toBe("analyzing");
    expect(reloaded.analysis).toBeNull();
    expect((await loadPhotoList(created.orderId))[0]?.legibilityScore).toBeNull();
  });

  it.each<OrderStatus>(["draft", "preview_ready"])(
    "pedido em %s devolve InvalidTransitionError sem gravar",
    async (status) => {
      const created = await insertOrder({ status });
      const photo = await insertPhoto(created.orderId, 0);
      const finished = await finish(created.orderId, buildPreviewReadyAnalysis(photo.orderPhotoId));
      expect(finished.ok).toBe(false);
      if (!finished.ok) expect(finished.error).toBeInstanceOf(InvalidTransitionError);
      const reloaded = await loadOrder(created.orderId);
      expect(reloaded.updateDatetime.getTime()).toBe(created.updateDatetime.getTime());
    },
  );

  it("recusa análise fora do schema antes de qualquer leitura", async () => {
    const created = await insertOrder({ status: "analyzing" });
    expect(
      finish(created.orderId, { outcome: "preview_ready" } as unknown as OrderAnalysis),
    ).rejects.toThrow();
  });
});

describe("check order_analysis_check (spec F2-02, RF-03)", () => {
  it("analyzing exige análise nula e preview_ready exige análise de prévia pronta", async () => {
    await expectSqlState(
      insertOrder({ status: "analyzing", analysis: unavailableOrderAnalysis }),
      SQL_STATE.checkViolation,
    );
    await expectSqlState(
      insertOrder({ status: "preview_ready", analysis: null }),
      SQL_STATE.checkViolation,
    );
    await expectSqlState(
      insertOrder({ status: "preview_ready", analysis: unavailableOrderAnalysis }),
      SQL_STATE.checkViolation,
    );
    expect(
      (await insertOrder({ status: "draft", analysis: unavailableOrderAnalysis })).status,
    ).toBe("draft");
  });
});

describe("recordAiCallList (spec F2-02, RF-07)", () => {
  it("grava uma linha por chamada com o order_id e ignora lista vazia", async () => {
    const created = await insertOrder();
    await recordAiCallList(testDatabase.db, created.orderId, []);
    const callValue = {
      stage: "extract",
      model: "modelo-barato",
      promptVersion: "extract-v1",
      inputTokenCount: 1200,
      outputTokenCount: 300,
      costCents: 0.42,
      durationMs: 2100,
      outcomeCode: "ok",
    } as const;
    await recordAiCallList(testDatabase.db, created.orderId, [
      callValue,
      { ...callValue, outcomeCode: "ai_output_invalid", costCents: 0.4 },
    ]);
    const rowList = await testDatabase.db
      .select()
      .from(aiCall)
      .where(eq(aiCall.orderId, created.orderId));
    expect(rowList).toHaveLength(2);
    expect(rowList.map((row) => row.outcomeCode).sort()).toEqual(["ai_output_invalid", "ok"]);
    expect(rowList.every((row) => row.stage === "extract")).toBe(true);
  });
});

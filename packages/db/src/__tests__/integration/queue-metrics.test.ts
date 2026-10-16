import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { type JobPayload, jobErrorCodeMap } from "@gizito/core";
import { eq } from "drizzle-orm";
import { enqueueJob, getQueueMetrics } from "#src/queue/index.ts";
import { job } from "#src/schema/index.ts";
import {
  createTestDatabase,
  type TestDatabase,
  truncateAllTables,
} from "#src/test-helpers/index.ts";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const generatePayload: JobPayload = { name: "order.generate", orderId: ORDER_ID };

let testDatabase: TestDatabase;
let now: Date;

const secondsAfter = (seconds: number) => new Date(now.getTime() + seconds * 1000);

async function insertJobWith(
  status: "active" | "completed" | "failed",
  { finishDatetime, lastErrorCode }: { finishDatetime?: Date; lastErrorCode?: string } = {},
) {
  const enqueued = await enqueueJob(testDatabase.db, generatePayload);
  await testDatabase.db
    .update(job)
    .set({ status, finishDatetime, lastErrorCode })
    .where(eq(job.jobId, enqueued.jobId));
}

beforeAll(async () => {
  testDatabase = await createTestDatabase();
});

afterAll(async () => {
  await testDatabase.destroy();
});

beforeEach(async () => {
  await truncateAllTables(testDatabase.db);
  now = new Date();
});

describe("getQueueMetrics", () => {
  it("fila vazia: zeros e idade nula", async () => {
    expect(
      await getQueueMetrics(testDatabase.db, { now, failedSinceDatetime: secondsAfter(-3600) }),
    ).toEqual({
      readyCount: 0,
      oldestReadyAgeSeconds: null,
      activeCount: 0,
      failedCount: 0,
      payloadInvalidCount: 0,
    });
  });

  it("conta prontos pela run_after, ignora futuros e mede a idade do mais antigo", async () => {
    await enqueueJob(testDatabase.db, generatePayload, { runAfterDatetime: secondsAfter(-90) });
    await enqueueJob(testDatabase.db, generatePayload, { runAfterDatetime: secondsAfter(-5) });
    await enqueueJob(testDatabase.db, generatePayload, { runAfterDatetime: secondsAfter(60) });
    const metrics = await getQueueMetrics(testDatabase.db, {
      now,
      failedSinceDatetime: secondsAfter(-3600),
    });
    expect(metrics.readyCount).toBe(2);
    expect(metrics.oldestReadyAgeSeconds).toBe(90);
  });

  it("conta ativos e falhas na janela, separando payload_invalid", async () => {
    await insertJobWith("active");
    await insertJobWith("completed", { finishDatetime: secondsAfter(-10) });
    await insertJobWith("failed", {
      finishDatetime: secondsAfter(-10),
      lastErrorCode: "unhandled_error",
    });
    await insertJobWith("failed", {
      finishDatetime: secondsAfter(-20),
      lastErrorCode: jobErrorCodeMap.payloadInvalid,
    });
    await insertJobWith("failed", {
      finishDatetime: secondsAfter(-7200),
      lastErrorCode: jobErrorCodeMap.payloadInvalid,
    });
    expect(
      await getQueueMetrics(testDatabase.db, { now, failedSinceDatetime: secondsAfter(-3600) }),
    ).toEqual({
      readyCount: 0,
      oldestReadyAgeSeconds: null,
      activeCount: 1,
      failedCount: 2,
      payloadInvalidCount: 1,
    });
  });
});

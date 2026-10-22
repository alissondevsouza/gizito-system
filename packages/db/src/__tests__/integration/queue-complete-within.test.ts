import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { err, ok } from "@gizito/core";
import { eq, sql } from "drizzle-orm";
import { buildOrderInsert } from "#src/__tests__/integration/helpers.ts";
import { enqueueJob, type JobHandler, workJob } from "#src/queue/index.ts";
import { job, order } from "#src/schema/index.ts";
import {
  createTestDatabase,
  type TestDatabase,
  truncateAllTables,
} from "#src/test-helpers/index.ts";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const WORKER_ID = "worker-test";

let testDatabase: TestDatabase;

class RollbackForTest extends Error {}

beforeAll(async () => {
  testDatabase = await createTestDatabase();
});

afterAll(async () => {
  await testDatabase.destroy();
});

beforeEach(async () => {
  await truncateAllTables(testDatabase.db);
});

async function enqueueAnalyze() {
  return enqueueJob(
    testDatabase.db,
    { name: "order.analyze", orderId: ORDER_ID },
    { runAfterDatetime: new Date(Date.now() - 1000) },
  );
}

async function loadJob(jobId: string) {
  const [row] = await testDatabase.db.select().from(job).where(eq(job.jobId, jobId));
  if (!row) throw new Error("job not found");
  return row;
}

async function countOrders() {
  const rowList = await testDatabase.db.select({ orderId: order.orderId }).from(order);
  return rowList.length;
}

function work(handler: JobHandler) {
  return workJob(testDatabase.db, { nameList: ["order.analyze"], workerId: WORKER_ID, handler });
}

async function stealLease(jobId: string) {
  await testDatabase.db
    .update(job)
    .set({ attemptCount: sql`${job.attemptCount} + 1`, lockedBy: "outro-worker" })
    .where(eq(job.jobId, jobId));
}

describe("completeWithin (spec F2-02, RF-06)", () => {
  it("conclui o job na transação do handler, junto com a escrita dele", async () => {
    const enqueued = await enqueueAnalyze();
    let completedInside = false;
    const outcome = await work(async (_claimedJob, { completeWithin }) => {
      await testDatabase.db.transaction(async (tx) => {
        await tx.insert(order).values(buildOrderInsert());
        completedInside = await completeWithin(tx);
        const [inside] = await tx
          .select({ status: job.status })
          .from(job)
          .where(eq(job.jobId, enqueued.jobId));
        expect(inside?.status).toBe("completed");
      });
      return ok(null);
    });
    expect(completedInside).toBe(true);
    expect(outcome).toMatchObject({ outcome: "completed", errorCode: null });
    const finished = await loadJob(enqueued.jobId);
    expect(finished.status).toBe("completed");
    expect(finished.lockedBy).toBeNull();
    expect(finished.finishDatetime).toBeInstanceOf(Date);
    expect(await countOrders()).toBe(1);
  });

  it("transação desfeita depois do completeWithin: o workJob conclui o job como antes", async () => {
    const enqueued = await enqueueAnalyze();
    const outcome = await work(async (_claimedJob, { completeWithin }) => {
      await testDatabase.db
        .transaction(async (tx) => {
          await tx.insert(order).values(buildOrderInsert());
          expect(await completeWithin(tx)).toBe(true);
          throw new RollbackForTest();
        })
        .catch((error: unknown) => {
          if (!(error instanceof RollbackForTest)) throw error;
        });
      expect((await loadJob(enqueued.jobId)).status).toBe("active");
      return ok(null);
    });
    expect(outcome.outcome).toBe("completed");
    expect((await loadJob(enqueued.jobId)).status).toBe("completed");
    expect(await countOrders()).toBe(0);
  });

  it("lease perdido: completeWithin devolve false e a transação desfeita não vira completed", async () => {
    const enqueued = await enqueueAnalyze();
    const seen: { completedInside?: boolean } = {};
    const outcome = await work(async (_claimedJob, { completeWithin }) => {
      await stealLease(enqueued.jobId);
      await testDatabase.db
        .transaction(async (tx) => {
          seen.completedInside = await completeWithin(tx);
          throw new RollbackForTest();
        })
        .catch((error: unknown) => {
          if (!(error instanceof RollbackForTest)) throw error;
        });
      return ok(null);
    });
    expect(seen.completedInside).toBe(false);
    expect(outcome.outcome).toBe("lease_lost");
    const stolen = await loadJob(enqueued.jobId);
    expect(stolen.status).toBe("active");
    expect(stolen.lockedBy).toBe("outro-worker");
  });

  it("completed de outra tentativa não conta como desta", async () => {
    const enqueued = await enqueueAnalyze();
    const outcome = await work(async (_claimedJob, { completeWithin }) => {
      await testDatabase.db
        .transaction(async (tx) => {
          await completeWithin(tx);
          throw new RollbackForTest();
        })
        .catch((error: unknown) => {
          if (!(error instanceof RollbackForTest)) throw error;
        });
      await testDatabase.db
        .update(job)
        .set({ attemptCount: sql`${job.attemptCount} + 1`, status: "completed" })
        .where(eq(job.jobId, enqueued.jobId));
      return ok(null);
    });
    expect(outcome.outcome).toBe("lease_lost");
  });

  it("handler que não chama completeWithin segue o caminho de sempre", async () => {
    const completedJob = await enqueueAnalyze();
    expect((await work(async () => ok(null))).outcome).toBe("completed");
    expect((await loadJob(completedJob.jobId)).status).toBe("completed");
    const failedJob = await enqueueAnalyze();
    const failed = await work(async () => err({ errorCode: "ai_auth_failed", retryable: false }));
    expect(failed.outcome).toBe("failed");
    expect((await loadJob(failedJob.jobId)).lastErrorCode).toBe("ai_auth_failed");
  });
});

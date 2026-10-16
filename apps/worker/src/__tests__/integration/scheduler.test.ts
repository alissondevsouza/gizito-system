import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { claimJob, enqueueJob, job } from "@gizito/db";
import { createTestDatabase, type TestDatabase, truncateAllTables } from "@gizito/db/test-helpers";
import { createMemoryLogger } from "@gizito/integrations/fakes";
import { eq } from "drizzle-orm";
import { ORDER_ID } from "#src/__tests__/integration/helpers.ts";
import {
  enqueueScheduledJob,
  runMaintenance,
  SCHEDULED_JOB_SINGLETON_KEY,
  scheduledJobList,
  startScheduler,
} from "#src/scheduler.ts";

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

async function listJobs() {
  return testDatabase.db
    .select({ name: job.name, status: job.status, singletonKey: job.singletonKey })
    .from(job)
    .orderBy(job.name);
}

describe("agendador com banco", () => {
  it("enfileirar o mesmo agendado duas vezes deixa um só pendente", async () => {
    const { logger } = createMemoryLogger();
    for (const scheduledJob of [...scheduledJobList, ...scheduledJobList]) {
      await enqueueScheduledJob({ db: testDatabase.db, logger }, scheduledJob);
    }
    expect(await listJobs()).toEqual([
      { name: "charge.reconcile", status: "pending", singletonKey: SCHEDULED_JOB_SINGLETON_KEY },
      { name: "retention.purge", status: "pending", singletonKey: SCHEDULED_JOB_SINGLETON_KEY },
    ]);
  });

  it("duas partidas seguidas agendam só o que o worker consome, uma vez", async () => {
    const { logger } = createMemoryLogger();
    for (let start = 0; start < 2; start += 1) {
      const scheduler = startScheduler({
        db: testDatabase.db,
        logger,
        handledNameList: ["charge.reconcile", "order.generate"],
      });
      await scheduler.stop();
    }
    expect(await listJobs()).toEqual([
      { name: "charge.reconcile", status: "pending", singletonKey: SCHEDULED_JOB_SINGLETON_KEY },
    ]);
  });

  it("manutenção devolve a pending o job com lock vencido e avisa", async () => {
    const claimNow = new Date(Date.now() - 20 * 60 * 1000);
    const enqueued = await enqueueJob(
      testDatabase.db,
      { name: "order.generate", orderId: ORDER_ID },
      { runAfterDatetime: claimNow },
    );
    const claimed = await claimJob(testDatabase.db, {
      nameList: ["order.generate"],
      workerId: "worker-morto",
      now: claimNow,
    });
    expect(claimed?.jobId).toBe(enqueued.jobId);
    const { logger, readEntryList } = createMemoryLogger();
    await runMaintenance({ db: testDatabase.db, logger });
    const [row] = await testDatabase.db.select().from(job).where(eq(job.jobId, enqueued.jobId));
    expect(row?.status).toBe("pending");
    expect(row?.lastErrorCode).toBe("lock_expired");
    expect(readEntryList().find((entry) => entry.level === 40)).toMatchObject({
      requeuedCount: 1,
      failedCount: 0,
    });
  });

  it("manutenção sem lock vencido não loga", async () => {
    const { logger, readEntryList } = createMemoryLogger();
    await runMaintenance({ db: testDatabase.db, logger });
    expect(readEntryList()).toEqual([]);
  });
});

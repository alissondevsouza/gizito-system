import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { err, jobErrorCodeMap, ok } from "@gizito/core";
import { enqueueJob, job } from "@gizito/db";
import { createTestDatabase, type TestDatabase, truncateAllTables } from "@gizito/db/test-helpers";
import { createMemoryLogger } from "@gizito/integrations";
import { eq, sql } from "drizzle-orm";
import { createCountdown, createGate, ORDER_ID } from "#src/__tests__/integration/helpers.ts";
import { type StartJobRunnerOptions, startJobRunner } from "#src/runner/job-runner.ts";
import { buildJobLaneList, type JobHandlerMap, listHandledJobNames } from "#src/runner/lanes.ts";

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

function startTestRunner(
  handlerMap: JobHandlerMap,
  options: Partial<StartJobRunnerOptions> & { generateConcurrency?: number } = {},
) {
  const memoryLogger = createMemoryLogger({ level: "info" });
  const runner = startJobRunner({
    db: testDatabase.db,
    handlerMap,
    laneList: buildJobLaneList(listHandledJobNames(handlerMap), {
      generateConcurrency: options.generateConcurrency ?? 2,
    }),
    workerId: "worker-test",
    logger: memoryLogger.logger,
    pollIntervalMs: 10,
    ...options,
  });
  return { runner, ...memoryLogger };
}

async function countJobsBy(status: "pending" | "active" | "completed" | "failed") {
  return testDatabase.db.$count(job, eq(job.status, status));
}

describe("runner sobre a fila", () => {
  it("consome, conclui e loga o job sem payload", async () => {
    const enqueued = await enqueueJob(testDatabase.db, {
      name: "order.notify",
      orderId: ORDER_ID,
      kind: "kit_ready",
    });
    const handled = createGate();
    const { runner, readEntryList, waitForEntryList } = startTestRunner({
      "order.notify": async () => {
        handled.open();
        return ok(null);
      },
    });
    await handled.opened;
    await waitForEntryList((entryList) => entryList.some((entry) => entry.msg === "job"));
    await runner.stop();
    expect(await countJobsBy("completed")).toBe(1);
    const entry = readEntryList().find((logEntry) => logEntry.msg === "job");
    expect(entry).toMatchObject({
      level: 30,
      jobId: enqueued.jobId,
      jobName: "order.notify",
      orderId: ORDER_ID,
      attemptCount: 1,
      outcome: "completed",
      errorCode: null,
    });
    expect(typeof entry?.durationMs).toBe("number");
    expect(entry).not.toHaveProperty("payload");
    expect(entry).not.toHaveProperty("kind");
  });

  it("nunca roda mais handlers de order.generate que GENERATE_CONCURRENCY", async () => {
    for (let index = 0; index < 4; index += 1) {
      await enqueueJob(testDatabase.db, { name: "order.generate", orderId: ORDER_ID });
    }
    const release = createGate();
    const twoStarted = createCountdown(2);
    const allFinished = createCountdown(4);
    let activeCount = 0;
    let maxActiveCount = 0;
    const { runner } = startTestRunner(
      {
        "order.generate": async () => {
          activeCount += 1;
          maxActiveCount = Math.max(maxActiveCount, activeCount);
          twoStarted.tick();
          await release.opened;
          activeCount -= 1;
          allFinished.tick();
          return ok(null);
        },
      },
      { generateConcurrency: 2 },
    );
    await twoStarted.reached;
    expect(await countJobsBy("active")).toBe(2);
    expect(await countJobsBy("pending")).toBe(2);
    release.open();
    await allFinished.reached;
    await runner.stop();
    expect(maxActiveCount).toBe(2);
    expect(await countJobsBy("completed")).toBe(4);
  });

  it("raia sem handler não consome", async () => {
    await enqueueJob(testDatabase.db, { name: "order.analyze", orderId: ORDER_ID });
    await enqueueJob(testDatabase.db, { name: "order.generate", orderId: ORDER_ID });
    const handled = createGate();
    const { runner, waitForEntryList } = startTestRunner({
      "order.generate": async () => {
        handled.open();
        return ok(null);
      },
    });
    await handled.opened;
    await waitForEntryList((entryList) => entryList.some((entry) => entry.msg === "job"));
    await runner.stop();
    const [analyze] = await testDatabase.db.select().from(job).where(eq(job.name, "order.analyze"));
    expect(analyze?.status).toBe("pending");
    expect(analyze?.attemptCount).toBe(0);
  });

  it("stop espera o job em curso terminar", async () => {
    await enqueueJob(testDatabase.db, { name: "order.generate", orderId: ORDER_ID });
    const started = createGate();
    const release = createGate();
    const { runner } = startTestRunner({
      "order.generate": async () => {
        started.open();
        await release.opened;
        return ok(null);
      },
    });
    await started.opened;
    let stopped = false;
    const stopping = runner.stop().then(() => {
      stopped = true;
    });
    expect(runner.state()).toBe("stopping");
    await Promise.resolve();
    expect(stopped).toBe(false);
    release.open();
    await stopping;
    expect(runner.state()).toBe("stopped");
    expect(await countJobsBy("completed")).toBe(1);
  });

  it("falha transitória loga warn com errorCode; exceção só vai para debug", async () => {
    await enqueueJob(testDatabase.db, { name: "order.generate", orderId: ORDER_ID });
    await enqueueJob(testDatabase.db, { name: "order.analyze", orderId: ORDER_ID });
    const memoryLogger = createMemoryLogger({ level: "debug" });
    const handlerMap: JobHandlerMap = {
      "order.generate": async () => err({ errorCode: "provider_unavailable", retryable: true }),
      "order.analyze": async () => {
        throw new Error("mensagem bruta do provedor");
      },
    };
    const runner = startJobRunner({
      db: testDatabase.db,
      handlerMap,
      laneList: buildJobLaneList(listHandledJobNames(handlerMap), { generateConcurrency: 1 }),
      workerId: "worker-test",
      logger: memoryLogger.logger,
      pollIntervalMs: 10,
    });
    await memoryLogger.waitForEntryList(
      (entryList) => entryList.filter((entry) => entry.msg === "job").length === 2,
    );
    await runner.stop();
    const jobEntryList = memoryLogger.readEntryList().filter((entry) => entry.msg === "job");
    expect(
      jobEntryList
        .map(({ level, jobName, outcome, errorCode }) => ({ level, jobName, outcome, errorCode }))
        .sort((left, right) => String(left.jobName).localeCompare(String(right.jobName))),
    ).toEqual([
      {
        level: 40,
        jobName: "order.analyze",
        outcome: "retry_scheduled",
        errorCode: jobErrorCodeMap.unhandledError,
      },
      {
        level: 40,
        jobName: "order.generate",
        outcome: "retry_scheduled",
        errorCode: "provider_unavailable",
      },
    ]);
    for (const entry of jobEntryList) expect(JSON.stringify(entry)).not.toContain("mensagem bruta");
    const causeEntry = memoryLogger.readEntryList().find((entry) => entry.msg === "causa do job");
    expect(causeEntry?.level).toBe(20);
    expect(JSON.stringify(causeEntry)).toContain("mensagem bruta do provedor");
  });

  it("job com payload inválido gera log error com payload_invalid", async () => {
    await testDatabase.db.execute(
      sql`INSERT INTO job (name, payload) VALUES ('order.generate', '{"name":"order.generate","orderId":"x"}')`,
    );
    const { runner, readEntryList, waitForEntryList } = startTestRunner({
      "order.generate": async () => ok(null),
    });
    await waitForEntryList((entryList) =>
      entryList.some((entry) => entry.errorCode === jobErrorCodeMap.payloadInvalid),
    );
    await runner.stop();
    const entry = readEntryList().find(
      (logEntry) => logEntry.errorCode === jobErrorCodeMap.payloadInvalid,
    );
    expect(entry).toMatchObject({ level: 50, jobName: "order.generate" });
    expect(JSON.stringify(entry)).not.toContain('"x"');
    expect(await countJobsBy("failed")).toBe(1);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { ok, workerHealthSchema } from "@gizito/core";
import { enqueueJob } from "@gizito/db";
import {
  createTestDatabase,
  resolveTestDatabaseUrl,
  type TestDatabase,
  withDatabaseName,
} from "@gizito/db/test-helpers";
import { createMemoryLogger } from "@gizito/integrations/fakes";
import { findFreePort, ORDER_ID, waitForHttpStatus } from "#src/__tests__/integration/helpers.ts";
import { readWorkerHealth } from "#src/health.ts";
import { HEALTH_PATH, startHealthServer } from "#src/health-server.ts";
import { startJobRunner } from "#src/runner/job-runner.ts";

const entryPath = join(import.meta.dir, "..", "..", "index.ts");

let testDatabase: TestDatabase;

beforeAll(async () => {
  testDatabase = await createTestDatabase();
});

afterAll(async () => {
  await testDatabase.destroy();
});

describe("health do worker", () => {
  it("200 com métricas da fila enquanto roda; 503 depois do stop; 404 fora de /health", async () => {
    await enqueueJob(testDatabase.db, { name: "order.analyze", orderId: ORDER_ID });
    const { logger } = createMemoryLogger();
    const runner = startJobRunner({
      db: testDatabase.db,
      handlerMap: { "order.generate": { handle: async () => ok(null) } },
      laneList: [{ key: "generate", nameList: ["order.generate"], concurrency: 1 }],
      workerId: "worker-test",
      logger,
      pollIntervalMs: 10,
    });
    const server = startHealthServer({
      hostname: "127.0.0.1",
      port: 0,
      readHealth: () =>
        readWorkerHealth({ db: testDatabase.db, logger, runnerState: runner.state }),
    });
    try {
      const running = await fetch(new URL(HEALTH_PATH, server.url));
      expect(running.status).toBe(200);
      const health = workerHealthSchema.parse(await running.json());
      expect(health.queue).toMatchObject({ readyCount: 1, activeCount: 0, failedCount: 0 });
      expect((await fetch(new URL("/outra", server.url))).status).toBe(404);
      await runner.stop();
      const stopped = await fetch(new URL(HEALTH_PATH, server.url));
      expect(stopped.status).toBe(503);
      expect(await stopped.json()).toEqual({ status: "unavailable", queue: null });
    } finally {
      await runner.stop();
      await server.stop(true);
    }
  });
});

describe("processo do worker", () => {
  it("sobe, responde /health e sai com 0 no SIGTERM", async () => {
    const port = await findFreePort();
    const child = Bun.spawn(["bun", entryPath], {
      env: {
        PATH: process.env.PATH ?? "",
        NODE_ENV: "test",
        DATABASE_URL: withDatabaseName(resolveTestDatabaseUrl(), testDatabase.databaseName),
        WORKER_HEALTH_PORT: String(port),
        LOG_LEVEL: "info",
        PAYMENT_GATEWAY: "fake",
        AI_API_KEY: "chave-de-teste",
        AI_MODEL_EXTRACT: "claude-haiku-5-5",
        AI_MODEL_GENERATE: "claude-sonnet-5-5",
        R2_ENDPOINT: "http://127.0.0.1:9000",
        R2_BUCKET: "gizito",
        R2_ACCESS_KEY_ID: "gizito",
        R2_SECRET_ACCESS_KEY: "segredo-de-teste",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    try {
      const response = await waitForHttpStatus(`http://127.0.0.1:${port}/health`, 200, child);
      expect(workerHealthSchema.parse(await response.json()).status).toBe("ok");
      child.kill("SIGTERM");
      expect(await child.exited).toBe(0);
      const messageList = (await new Response(child.stdout).text())
        .trim()
        .split("\n")
        .map((line) => (JSON.parse(line) as { msg: string }).msg);
      expect(messageList).toContain("worker no ar");
      expect(messageList).toContain("worker parando");
    } finally {
      child.kill("SIGKILL");
    }
  });
});

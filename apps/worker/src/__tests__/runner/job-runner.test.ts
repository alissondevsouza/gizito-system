import { afterAll, describe, expect, it } from "bun:test";
import { ok } from "@gizito/core";
import { createDatabase } from "@gizito/db";
import { createMemoryLogger } from "@gizito/integrations";
import { JOB_LOOP_FAILED_ERROR_CODE, startJobRunner } from "#src/runner/job-runner.ts";

const unreachableDatabase = createDatabase({
  databaseUrl: "postgres://gizito:gizito@127.0.0.1:1/gizito",
  maxConnections: 1,
});

afterAll(async () => {
  await unreachableDatabase.close();
});

describe("runner sem banco", () => {
  it("loga a falha do laço, tenta de novo e segue rodando até o stop", async () => {
    const { logger, readEntryList, waitForEntryList } = createMemoryLogger({ level: "info" });
    const runner = startJobRunner({
      db: unreachableDatabase.db,
      handlerMap: { "order.generate": async () => ok(null) },
      laneList: [{ key: "generate", nameList: ["order.generate"], concurrency: 1 }],
      workerId: "worker-test",
      logger,
      errorBackoffMs: 1,
    });
    await waitForEntryList(
      (entryList) =>
        entryList.filter((entry) => entry.errorCode === JOB_LOOP_FAILED_ERROR_CODE).length >= 2,
    );
    expect(runner.state()).toBe("running");
    await runner.stop();
    expect(runner.state()).toBe("stopped");
    const failure = readEntryList().find((entry) => entry.errorCode === JOB_LOOP_FAILED_ERROR_CODE);
    expect(failure).toMatchObject({ level: 50, lane: "generate" });
    expect(failure).not.toHaveProperty("err");
  });

  it("sem raias, stop resolve na hora", async () => {
    const { logger } = createMemoryLogger();
    const runner = startJobRunner({
      db: unreachableDatabase.db,
      handlerMap: {},
      laneList: [],
      workerId: "worker-test",
      logger,
    });
    await runner.stop();
    expect(runner.state()).toBe("stopped");
  });
});

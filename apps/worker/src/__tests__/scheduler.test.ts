import { afterAll, describe, expect, it } from "bun:test";
import { createDatabase } from "@gizito/db";
import { createMemoryLogger } from "@gizito/integrations/fakes";
import {
  SCHEDULER_TASK_FAILED_ERROR_CODE,
  scheduledJobList,
  startScheduler,
} from "#src/scheduler.ts";

const unreachableDatabase = createDatabase({
  databaseUrl: "postgres://gizito:gizito@127.0.0.1:1/gizito",
  maxConnections: 1,
});

afterAll(async () => {
  await unreachableDatabase.close();
});

describe("agendador (jobs.md §5)", () => {
  it("charge.reconcile a cada 2 minutos e retention.purge uma vez por dia", () => {
    expect(
      scheduledJobList.map(({ payload, intervalSeconds }) => [payload.name, intervalSeconds]),
    ).toEqual([
      ["charge.reconcile", 120],
      ["retention.purge", 86_400],
    ]);
  });

  it("falha de tarefa vira log de erro sem derrubar o agendador", async () => {
    const { logger, readEntryList } = createMemoryLogger();
    const scheduler = startScheduler({
      db: unreachableDatabase.db,
      logger,
      handledNameList: ["charge.reconcile"],
    });
    await scheduler.stop();
    const failedTaskList = readEntryList()
      .filter((entry) => entry.errorCode === SCHEDULER_TASK_FAILED_ERROR_CODE)
      .map((entry) => entry.task)
      .sort();
    expect(failedTaskList).toEqual(["charge.reconcile", "maintenance"]);
  });
});

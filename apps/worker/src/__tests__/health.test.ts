import { afterAll, describe, expect, it } from "bun:test";
import { createDatabase } from "@gizito/db";
import { createMemoryLogger } from "@gizito/integrations";
import { readWorkerHealth } from "#src/health.ts";

const unreachableDatabase = createDatabase({
  databaseUrl: "postgres://gizito:gizito@127.0.0.1:1/gizito",
  maxConnections: 1,
});

afterAll(async () => {
  await unreachableDatabase.close();
});

describe("readWorkerHealth", () => {
  it("runner parando ou parado: unavailable sem consultar o banco", async () => {
    const { logger, readEntryList } = createMemoryLogger();
    for (const state of ["stopping", "stopped"] as const) {
      expect(
        await readWorkerHealth({ db: unreachableDatabase.db, logger, runnerState: () => state }),
      ).toEqual({ status: "unavailable", queue: null });
    }
    expect(readEntryList()).toEqual([]);
  });

  it("runner rodando sem banco: unavailable com aviso sem detalhe", async () => {
    const { logger, readEntryList } = createMemoryLogger();
    expect(
      await readWorkerHealth({ db: unreachableDatabase.db, logger, runnerState: () => "running" }),
    ).toEqual({ status: "unavailable", queue: null });
    const [warn] = readEntryList();
    expect(warn).toMatchObject({ level: 40, errorCode: "database_unavailable" });
    expect(warn).not.toHaveProperty("err");
  });
});

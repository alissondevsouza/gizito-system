import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { Socket, TCPSocketListener } from "bun";
import { sql } from "drizzle-orm";
import {
  createDatabase,
  type DatabaseHandle,
  DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_MS,
  DEFAULT_LOCK_TIMEOUT_MS,
  DEFAULT_STATEMENT_TIMEOUT_MS,
} from "#src/client.ts";
import { DatabaseTimeoutError, pingDatabase } from "#src/health.ts";
import { getQueueMetrics } from "#src/queue/index.ts";
import {
  createTestDatabase,
  resolveTestDatabaseUrl,
  type TestDatabase,
  withDatabaseName,
} from "#src/test-helpers/index.ts";

let testDatabase: TestDatabase;
let silentServer: TCPSocketListener<undefined>;
const openSocketList: Socket<undefined>[] = [];

beforeAll(async () => {
  testDatabase = await createTestDatabase();
  silentServer = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      open: (socket) => {
        openSocketList.push(socket);
      },
      data: () => undefined,
    },
  });
});

afterAll(async () => {
  for (const socket of openSocketList) socket.end();
  silentServer.stop(true);
  await testDatabase.destroy();
});

function createSilentDatabase() {
  return createDatabase({
    databaseUrl: `postgres://gizito:gizito@127.0.0.1:${silentServer.port}/gizito`,
    maxConnections: 1,
    connectionTimeoutSeconds: 1,
  });
}

async function closeAfterConnectionTimeout(handle: DatabaseHandle) {
  await expect(Promise.resolve(handle.db.execute(sql`SELECT 1`))).rejects.toBeDefined();
  await handle.close();
}

async function selectSetting(name: string, db = testDatabase.db) {
  const rowList = (await db.execute(sql.raw(`SHOW ${name}`))) as unknown as Record<
    string,
    string
  >[];
  return rowList[0]?.[name];
}

describe("pingDatabase", () => {
  it("resolve com o banco no ar", async () => {
    await expect(pingDatabase(testDatabase.db)).resolves.toBeUndefined();
  });

  it("rejeita com o banco inalcançável", async () => {
    const unreachable = createDatabase({
      databaseUrl: "postgres://gizito:gizito@127.0.0.1:1/gizito",
      maxConnections: 1,
    });
    try {
      await expect(pingDatabase(unreachable.db)).rejects.toBeDefined();
    } finally {
      await unreachable.close();
    }
  });

  it("banco que aceita a conexão e não responde falha no teto, não em 30 s", async () => {
    const silent = createSilentDatabase();
    const startTime = performance.now();
    try {
      await expect(pingDatabase(silent.db, { timeoutMs: 200 })).rejects.toBeInstanceOf(
        DatabaseTimeoutError,
      );
      expect(performance.now() - startTime).toBeLessThan(900);
    } finally {
      await closeAfterConnectionTimeout(silent);
    }
  });
});

describe("getQueueMetrics", () => {
  it("também tem teto quando o banco não responde", async () => {
    const silent = createSilentDatabase();
    try {
      await expect(
        getQueueMetrics(silent.db, {
          now: new Date(),
          failedSinceDatetime: new Date(0),
          timeoutMs: 200,
        }),
      ).rejects.toBeInstanceOf(DatabaseTimeoutError);
    } finally {
      await closeAfterConnectionTimeout(silent);
    }
  });
});

describe("timeouts do pool", () => {
  it("cada conexão sai com statement, lock e idle-in-transaction timeouts", async () => {
    expect(await selectSetting("statement_timeout")).toBe(
      `${DEFAULT_STATEMENT_TIMEOUT_MS / 1000}s`,
    );
    expect(await selectSetting("lock_timeout")).toBe(`${DEFAULT_LOCK_TIMEOUT_MS / 1000}s`);
    expect(await selectSetting("idle_in_transaction_session_timeout")).toBe(
      `${DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_MS / 60_000}min`,
    );
  });

  it("consulta acima do statement_timeout é cancelada pelo banco", async () => {
    const strict = createDatabase({
      databaseUrl: withDatabaseName(resolveTestDatabaseUrl(), testDatabase.databaseName),
      maxConnections: 1,
      statementTimeoutMs: 100,
    });
    try {
      let caught: unknown;
      try {
        await strict.db.execute(sql`SELECT pg_sleep(1)`);
      } catch (error) {
        caught = error;
      }
      const postgresError = ((caught as { cause?: unknown }).cause ?? caught) as {
        errno?: unknown;
      };
      expect(postgresError.errno).toBe("57014");
    } finally {
      await strict.close();
    }
  });

  it("statement_timeout zero desliga o teto, como no migrate", async () => {
    const unbounded = createDatabase({
      databaseUrl: withDatabaseName(resolveTestDatabaseUrl(), testDatabase.databaseName),
      maxConnections: 1,
      statementTimeoutMs: 0,
    });
    try {
      expect(await selectSetting("statement_timeout", unbounded.db)).toBe("0");
    } finally {
      await unbounded.close();
    }
  });
});

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createDatabase } from "#src/client.ts";
import { pingDatabase } from "#src/health.ts";
import { createTestDatabase, type TestDatabase } from "#src/test-helpers/index.ts";

let testDatabase: TestDatabase;

beforeAll(async () => {
  testDatabase = await createTestDatabase();
});

afterAll(async () => {
  await testDatabase.destroy();
});

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
});

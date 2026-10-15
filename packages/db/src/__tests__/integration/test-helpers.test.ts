import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { buildOrderInsert, buildOrderPhotoInsert } from "#src/__tests__/integration/helpers.ts";
import { order, orderPhoto } from "#src/schema/index.ts";
import {
  createTestDatabase,
  TEST_DATABASE_NAME_PREFIX,
  type TestDatabase,
  truncateAllTables,
  withDatabaseName,
} from "#src/test-helpers/index.ts";

let testDatabase: TestDatabase;

beforeAll(async () => {
  testDatabase = await createTestDatabase();
});

afterAll(async () => {
  await testDatabase.destroy();
});

async function listDatabaseNameList(): Promise<string[]> {
  const rowList = (await testDatabase.db.execute(
    sql`SELECT datname FROM pg_database WHERE datname LIKE ${`${TEST_DATABASE_NAME_PREFIX}%`}`,
  )) as unknown as { datname: string }[];
  return Array.from(rowList).map((row) => row.datname);
}

describe("createTestDatabase", () => {
  it("cria um banco isolado por chamada e o destroy o remove", async () => {
    const other = await createTestDatabase();
    expect(other.databaseName).toStartWith(TEST_DATABASE_NAME_PREFIX);
    expect(other.databaseName).not.toBe(testDatabase.databaseName);
    expect(await listDatabaseNameList()).toContain(other.databaseName);
    await other.db.insert(order).values(buildOrderInsert());
    await other.destroy();
    expect(await listDatabaseNameList()).not.toContain(other.databaseName);
    expect(await testDatabase.db.$count(order)).toBe(0);
  });

  it("withDatabaseName troca só o caminho da URL", () => {
    expect(
      withDatabaseName("postgres://gizito:gizito@127.0.0.1:5433/gizito", "gizito_test_a"),
    ).toBe("postgres://gizito:gizito@127.0.0.1:5433/gizito_test_a");
  });
});

describe("truncateAllTables", () => {
  it("zera pedido e filhas", async () => {
    const [row] = await testDatabase.db.insert(order).values(buildOrderInsert()).returning();
    if (!row) throw new Error("insert returned no row");
    await testDatabase.db.insert(orderPhoto).values(buildOrderPhotoInsert(row.orderId));
    expect(await testDatabase.db.$count(order)).toBe(1);
    await truncateAllTables(testDatabase.db);
    expect(await testDatabase.db.$count(order)).toBe(0);
    expect(await testDatabase.db.$count(orderPhoto)).toBe(0);
  });
});

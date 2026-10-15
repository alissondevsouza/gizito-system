import { randomBytes } from "node:crypto";
import { SQL } from "bun";
import { getTableName, sql } from "drizzle-orm";
import { createDatabase, type Database } from "#src/client.ts";
import { runMigrations } from "#src/migrations.ts";
import { tableList } from "#src/schema/index.ts";

export const LOCAL_TEST_DATABASE_URL = "postgres://gizito:gizito@127.0.0.1:5433/gizito";
export const TEST_DATABASE_NAME_PREFIX = "gizito_test_";
const TEST_DATABASE_NAME_RANDOM_BYTES = 6;
const TEST_DATABASE_MAX_CONNECTIONS = 4;

export type TestDatabase = {
  db: Database;
  databaseName: string;
  destroy: () => Promise<void>;
};

export type CreateTestDatabaseOptions = {
  adminDatabaseUrl?: string;
};

export function resolveTestDatabaseUrl(): string {
  return process.env.TEST_DATABASE_URL ?? LOCAL_TEST_DATABASE_URL;
}

export function withDatabaseName(databaseUrl: string, databaseName: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function randomTestDatabaseName(): string {
  return `${TEST_DATABASE_NAME_PREFIX}${randomBytes(TEST_DATABASE_NAME_RANDOM_BYTES).toString("hex")}`;
}

async function runAsAdmin(adminDatabaseUrl: string, statement: string): Promise<void> {
  const admin = new SQL({ url: adminDatabaseUrl, max: 1 });
  try {
    await admin.unsafe(statement);
  } finally {
    await admin.close();
  }
}

export async function createTestDatabase({
  adminDatabaseUrl = resolveTestDatabaseUrl(),
}: CreateTestDatabaseOptions = {}): Promise<TestDatabase> {
  const databaseName = randomTestDatabaseName();
  await runAsAdmin(adminDatabaseUrl, `CREATE DATABASE "${databaseName}"`);
  const handle = createDatabase({
    databaseUrl: withDatabaseName(adminDatabaseUrl, databaseName),
    maxConnections: TEST_DATABASE_MAX_CONNECTIONS,
  });
  try {
    await runMigrations(handle.db);
  } catch (error) {
    await handle.close();
    await runAsAdmin(adminDatabaseUrl, `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    throw error;
  }
  return {
    db: handle.db,
    databaseName,
    destroy: async () => {
      await handle.close();
      await runAsAdmin(adminDatabaseUrl, `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    },
  };
}

export async function truncateAllTables(db: Database): Promise<void> {
  const quotedNameList = tableList.map((table) => `"${getTableName(table)}"`);
  await db.execute(sql.raw(`TRUNCATE TABLE ${quotedNameList.join(", ")} CASCADE`));
}

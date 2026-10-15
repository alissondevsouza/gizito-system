import { SQL } from "bun";
import { type BunSQLDatabase, drizzle } from "drizzle-orm/bun-sql";
import * as schema from "#src/schema/index.ts";

export type DatabaseSchema = typeof schema;
export type Database = BunSQLDatabase<DatabaseSchema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type CreateDatabaseOptions = {
  databaseUrl: string;
  maxConnections?: number;
};

export type DatabaseHandle = {
  db: Database;
  close: () => Promise<void>;
};

const DEFAULT_MAX_CONNECTIONS = 10;

export function createDatabase({
  databaseUrl,
  maxConnections = DEFAULT_MAX_CONNECTIONS,
}: CreateDatabaseOptions): DatabaseHandle {
  const client = new SQL({ url: databaseUrl, max: maxConnections });
  const db = drizzle({ client, schema });
  return { db, close: () => client.close() };
}

import { SQL } from "bun";
import { type BunSQLDatabase, drizzle } from "drizzle-orm/bun-sql";
import * as schema from "#src/schema/index.ts";

export type DatabaseSchema = typeof schema;
export type Database = BunSQLDatabase<DatabaseSchema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Executor = Database | Transaction;

export type CreateDatabaseOptions = {
  databaseUrl: string;
  maxConnections?: number;
  connectionTimeoutSeconds?: number;
  statementTimeoutMs?: number;
  lockTimeoutMs?: number;
  idleInTransactionTimeoutMs?: number;
};

export type CloseDatabaseOptions = {
  timeoutSeconds?: number;
};

export type DatabaseHandle = {
  db: Database;
  close: (options?: CloseDatabaseOptions) => Promise<void>;
};

export const DEFAULT_MAX_CONNECTIONS = 10;
export const DEFAULT_CONNECTION_TIMEOUT_SECONDS = 5;
export const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;
export const DEFAULT_LOCK_TIMEOUT_MS = 10_000;
export const DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_MS = 60_000;

export function createDatabase({
  databaseUrl,
  maxConnections = DEFAULT_MAX_CONNECTIONS,
  connectionTimeoutSeconds = DEFAULT_CONNECTION_TIMEOUT_SECONDS,
  statementTimeoutMs = DEFAULT_STATEMENT_TIMEOUT_MS,
  lockTimeoutMs = DEFAULT_LOCK_TIMEOUT_MS,
  idleInTransactionTimeoutMs = DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_MS,
}: CreateDatabaseOptions): DatabaseHandle {
  const client = new SQL({
    url: databaseUrl,
    max: maxConnections,
    connectionTimeout: connectionTimeoutSeconds,
    connection: {
      statement_timeout: statementTimeoutMs,
      lock_timeout: lockTimeoutMs,
      idle_in_transaction_session_timeout: idleInTransactionTimeoutMs,
    },
  });
  const db = drizzle({ client, schema });
  return {
    db,
    close: ({ timeoutSeconds }: CloseDatabaseOptions = {}) =>
      client.close(timeoutSeconds === undefined ? undefined : { timeout: timeoutSeconds }),
  };
}

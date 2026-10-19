import { sql } from "drizzle-orm";
import type { Executor } from "#src/client.ts";

export const DATABASE_HEALTH_TIMEOUT_MS = 2000;

export class DatabaseTimeoutError extends Error {
  readonly code = "database_timeout";

  constructor(readonly timeoutMs: number) {
    super(`Database did not answer within ${timeoutMs} ms`);
    this.name = "DatabaseTimeoutError";
  }
}

export async function withDatabaseTimeout<T>(
  operation: PromiseLike<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new DatabaseTimeoutError(timeoutMs)), timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export type PingDatabaseOptions = {
  timeoutMs?: number;
};

export async function pingDatabase(
  executor: Executor,
  { timeoutMs = DATABASE_HEALTH_TIMEOUT_MS }: PingDatabaseOptions = {},
): Promise<void> {
  await withDatabaseTimeout(executor.execute(sql`SELECT 1`), timeoutMs);
}

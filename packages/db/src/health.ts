import { sql } from "drizzle-orm";
import type { Executor } from "#src/client.ts";

export async function pingDatabase(executor: Executor): Promise<void> {
  await executor.execute(sql`SELECT 1`);
}

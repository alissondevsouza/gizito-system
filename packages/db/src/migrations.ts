import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import type { Database } from "#src/client.ts";

export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

export function runMigrations(db: Database): Promise<void> {
  return migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

import { z } from "zod";
import { createDatabase } from "#src/client.ts";
import { MIGRATIONS_FOLDER, runMigrations } from "#src/migrations.ts";

const databaseUrl = z
  .url({ error: "DATABASE_URL must be set to a valid URL" })
  .parse(process.env.DATABASE_URL);

const { db, close } = createDatabase({ databaseUrl, maxConnections: 1 });
try {
  await runMigrations(db);
  console.log(`migrations applied from ${MIGRATIONS_FOLDER}`);
} finally {
  await close();
}

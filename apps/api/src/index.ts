import { createDatabase } from "@gizito/db";
import { createLogger } from "@gizito/integrations";
import { z } from "zod";
import { createApp } from "#src/app.ts";
import { apiConfigSchema } from "#src/config.ts";

const parsedConfig = apiConfigSchema.safeParse(process.env);
if (!parsedConfig.success) {
  process.stderr.write(`Configuração inválida da api:\n${z.prettifyError(parsedConfig.error)}\n`);
  process.exit(1);
}
const config = parsedConfig.data;
const logger = createLogger({ service: "api", level: config.LOG_LEVEL });
const database = createDatabase({ databaseUrl: config.DATABASE_URL });
const app = createApp({ db: database.db, logger, webPublicUrl: config.WEB_PUBLIC_URL }).listen({
  hostname: config.HOST,
  port: config.API_PORT,
});
logger.info({ host: config.HOST, port: app.server?.port }, "api no ar");

let stopping = false;

async function shutdown(signal: NodeJS.Signals) {
  if (stopping) process.exit(1);
  stopping = true;
  logger.info({ signal }, "api parando");
  await app.stop();
  await database.close();
  process.exit(0);
}

process.on("SIGTERM", (signal) => void shutdown(signal));
process.on("SIGINT", (signal) => void shutdown(signal));

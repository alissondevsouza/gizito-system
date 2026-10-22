import { createDatabase } from "@gizito/db";
import { createLogger, createPhotoNormalizer, createR2ObjectStorage } from "@gizito/integrations";
import { z } from "zod";
import { createApp } from "#src/app.ts";
import { apiConfigSchema } from "#src/config.ts";

const DATABASE_CLOSE_TIMEOUT_SECONDS = 5;

const parsedConfig = apiConfigSchema.safeParse(process.env);
if (!parsedConfig.success) {
  process.stderr.write(`Configuração inválida da api:\n${z.prettifyError(parsedConfig.error)}\n`);
  process.exit(1);
}
const config = parsedConfig.data;
const logger = createLogger({ service: "api", level: config.LOG_LEVEL });
const database = createDatabase({ databaseUrl: config.DATABASE_URL });
const storage = createR2ObjectStorage({
  endpoint: config.R2_ENDPOINT,
  bucket: config.R2_BUCKET,
  region: config.R2_REGION,
  accessKeyId: config.R2_ACCESS_KEY_ID,
  secretAccessKey: config.R2_SECRET_ACCESS_KEY,
});
const app = createApp({
  db: database.db,
  logger,
  webPublicUrl: config.WEB_PUBLIC_URL,
  storage,
  normalizePhoto: createPhotoNormalizer(),
  clientHashSecret: config.CLIENT_HASH_SECRET,
  trustedProxyHopCount: config.TRUSTED_PROXY_HOP_COUNT,
  isSecureCookie: config.NODE_ENV === "production",
}).listen({
  hostname: config.HOST,
  port: config.API_PORT,
  reusePort: false,
});
logger.info({ host: config.HOST, port: app.server?.port }, "api no ar");

let stopping = false;

async function shutdown(signal: NodeJS.Signals) {
  if (stopping) process.exit(1);
  stopping = true;
  logger.info({ signal }, "api parando");
  await app.stop();
  await database.close({ timeoutSeconds: DATABASE_CLOSE_TIMEOUT_SECONDS });
  process.exit(0);
}

process.on("SIGTERM", (signal) => void shutdown(signal));
process.on("SIGINT", (signal) => void shutdown(signal));

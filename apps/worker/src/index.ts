import { hostname } from "node:os";
import type { PaymentGateway, PaymentGatewaySetting } from "@gizito/core";
import { createDatabase } from "@gizito/db";
import {
  createAnthropicProvider,
  createLogger,
  createMathjsEvaluator,
  createMercadoPagoGateway,
  createR2ObjectStorage,
  isKatexParsable,
} from "@gizito/integrations";
import { createFakePaymentGateway, type FakeUnknownChargeStatus } from "@gizito/integrations/fakes";
import { z } from "zod";
import { workerConfigSchema } from "#src/config.ts";
import { readWorkerHealth } from "#src/health.ts";
import { startHealthServer } from "#src/health-server.ts";
import { buildJobHandlerMap, handledJobNameList } from "#src/jobs/index.ts";
import { createPdfRenderer } from "#src/render/pdf-renderer.ts";
import { startJobRunner } from "#src/runner/job-runner.ts";
import {
  buildExhaustedJobDispatcher,
  buildJobLaneList,
  countWorkerConnections,
} from "#src/runner/lanes.ts";
import { startScheduler } from "#src/scheduler.ts";

const DATABASE_CLOSE_TIMEOUT_SECONDS = 5;

function createPaymentGateway(
  setting: PaymentGatewaySetting,
  unknownChargeStatus: FakeUnknownChargeStatus | undefined,
): PaymentGateway {
  if (setting.name === "fake") return createFakePaymentGateway({ unknownChargeStatus });
  return createMercadoPagoGateway({
    accessToken: setting.accessToken,
    webhookSecret: setting.webhookSecret,
  });
}

const parsedConfig = workerConfigSchema.safeParse(process.env);
if (!parsedConfig.success) {
  process.stderr.write(
    `Configuração inválida do worker:\n${z.prettifyError(parsedConfig.error)}\n`,
  );
  process.exit(1);
}
const config = parsedConfig.data;
const logger = createLogger({ service: "worker", level: config.LOG_LEVEL });
const workerId = `${hostname()}-${process.pid}`;
const aiProvider = createAnthropicProvider({
  apiKey: config.AI_API_KEY,
  extract: { model: config.AI_MODEL_EXTRACT, effort: config.AI_EFFORT_EXTRACT },
  generate: { model: config.AI_MODEL_GENERATE, effort: config.AI_EFFORT_GENERATE },
});
const storage = createR2ObjectStorage({
  endpoint: config.R2_ENDPOINT,
  bucket: config.R2_BUCKET,
  region: config.R2_REGION,
  accessKeyId: config.R2_ACCESS_KEY_ID,
  secretAccessKey: config.R2_SECRET_ACCESS_KEY,
});
const pdfRenderer = createPdfRenderer({ concurrency: config.RENDER_CONCURRENCY });
const laneList = buildJobLaneList(handledJobNameList, {
  generateConcurrency: config.GENERATE_CONCURRENCY,
});
const database = createDatabase({
  databaseUrl: config.DATABASE_URL,
  maxConnections: countWorkerConnections(laneList),
});
const jobHandlerMap = buildJobHandlerMap({
  db: database.db,
  aiProvider,
  storage,
  mathEvaluator: createMathjsEvaluator(),
  isMathMarkupParsable: isKatexParsable,
  pdfRenderer,
  paymentGateway: createPaymentGateway(
    config.paymentGateway,
    config.FAKE_GATEWAY_UNKNOWN_CHARGE_STATUS,
  ),
  extractModel: config.AI_MODEL_EXTRACT,
  logger,
  now: () => new Date(),
});

const healthServer = startHealthServer({
  hostname: config.HOST,
  port: config.WORKER_HEALTH_PORT,
  readHealth: () => readWorkerHealth({ db: database.db, logger, runnerState: runner.state }),
});
const runner = startJobRunner({
  db: database.db,
  handlerMap: jobHandlerMap,
  laneList,
  workerId,
  logger,
});
const scheduler = startScheduler({
  db: database.db,
  logger,
  handledNameList: handledJobNameList,
  onExhausted: buildExhaustedJobDispatcher(jobHandlerMap),
});
logger.info(
  {
    workerId,
    host: config.HOST,
    port: healthServer.port,
    laneList: laneList.map(({ key, nameList, concurrency }) => ({ key, nameList, concurrency })),
  },
  "worker no ar",
);

let stopping = false;

async function shutdown(signal: NodeJS.Signals) {
  if (stopping) process.exit(1);
  stopping = true;
  logger.info({ signal }, "worker parando");
  await scheduler.stop();
  await runner.stop();
  await pdfRenderer.close();
  await healthServer.stop();
  await database.close({ timeoutSeconds: DATABASE_CLOSE_TIMEOUT_SECONDS });
  process.exit(0);
}

process.on("SIGTERM", (signal) => void shutdown(signal));
process.on("SIGINT", (signal) => void shutdown(signal));

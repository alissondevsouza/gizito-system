import { hostname } from "node:os";
import { createDatabase } from "@gizito/db";
import { createLogger } from "@gizito/integrations";
import { z } from "zod";
import { workerConfigSchema } from "#src/config.ts";
import { readWorkerHealth } from "#src/health.ts";
import { startHealthServer } from "#src/health-server.ts";
import { jobHandlerMap } from "#src/jobs/index.ts";
import { startJobRunner } from "#src/runner/job-runner.ts";
import { buildJobLaneList, listHandledJobNames } from "#src/runner/lanes.ts";
import { startScheduler } from "#src/scheduler.ts";

const parsedConfig = workerConfigSchema.safeParse(process.env);
if (!parsedConfig.success) {
  process.stderr.write(
    `Configuração inválida do worker:\n${z.prettifyError(parsedConfig.error)}\n`,
  );
  process.exit(1);
}
const config = parsedConfig.data;
const logger = createLogger({ service: "worker", level: config.LOG_LEVEL });
const database = createDatabase({ databaseUrl: config.DATABASE_URL });
const workerId = `${hostname()}-${process.pid}`;
const handledNameList = listHandledJobNames(jobHandlerMap);
const laneList = buildJobLaneList(handledNameList, {
  generateConcurrency: config.GENERATE_CONCURRENCY,
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
const scheduler = startScheduler({ db: database.db, logger, handledNameList });
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
  await healthServer.stop();
  await database.close();
  process.exit(0);
}

process.on("SIGTERM", (signal) => void shutdown(signal));
process.on("SIGINT", (signal) => void shutdown(signal));

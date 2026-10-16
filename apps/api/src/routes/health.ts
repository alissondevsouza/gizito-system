import { apiHealthSchema } from "@gizito/core";
import type { Executor } from "@gizito/db";
import type { Logger } from "@gizito/integrations";
import { Elysia } from "elysia";
import { checkApiHealth } from "#src/services/health.ts";

export function createHealthRoutes({ db, logger }: { db: Executor; logger: Logger }) {
  return new Elysia().get(
    "/health",
    async ({ status }) => {
      const { health, errorName } = await checkApiHealth(db);
      if (health.status === "ok") return health;
      logger.warn({ errorCode: "database_unavailable", errorName }, "health sem banco");
      return status(503, health);
    },
    { response: { 200: apiHealthSchema, 503: apiHealthSchema } },
  );
}

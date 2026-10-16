import { cors } from "@elysiajs/cors";
import type { Executor } from "@gizito/db";
import type { Logger } from "@gizito/integrations";
import { Elysia } from "elysia";
import { toApiErrorResponse } from "#src/errors.ts";
import { createHealthRoutes } from "#src/routes/health.ts";

export const UNMATCHED_ROUTE = "unmatched";

export type AppDependencies = {
  db: Executor;
  logger: Logger;
  webPublicUrl: string;
};

export function createApp({ db, logger, webPublicUrl }: AppDependencies) {
  const requestStartMap = new WeakMap<Request, number>();
  return new Elysia()
    .use(cors({ origin: new URL(webPublicUrl).origin }))
    .onRequest(({ request }) => {
      requestStartMap.set(request, performance.now());
    })
    .onError(({ code, error, set }) => {
      const response = toApiErrorResponse(code, error);
      if (response.status >= 500) {
        logger.error(
          { errorCode: response.body.code, errorName: error instanceof Error ? error.name : code },
          "erro inesperado",
        );
        logger.debug({ err: error }, "detalhe do erro inesperado");
      }
      set.status = response.status;
      return response.body;
    })
    .onAfterResponse(({ request, route, set }) => {
      const startTime = requestStartMap.get(request);
      logger.info(
        {
          method: request.method,
          route: route || UNMATCHED_ROUTE,
          status: set.status,
          durationMs: startTime === undefined ? null : Math.round(performance.now() - startTime),
        },
        "request",
      );
    })
    .use(createHealthRoutes({ db, logger }));
}

export type App = ReturnType<typeof createApp>;

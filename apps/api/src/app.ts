import { cors } from "@elysiajs/cors";
import { type ApiErrorCode, apiErrorSchema, errorNameOf } from "@gizito/core";
import type { Executor } from "@gizito/db";
import type { Logger } from "@gizito/integrations";
import { Elysia, ElysiaCustomStatusResponse, StatusMap } from "elysia";
import { toApiErrorResponse } from "#src/errors.ts";
import { createHealthRoutes } from "#src/routes/health.ts";

export const UNMATCHED_ROUTE = "unmatched";

export type AppDependencies = {
  db: Executor;
  logger: Logger;
  webPublicUrl: string;
};

type ResponseStatus = number | keyof typeof StatusMap | undefined;

function readResponseStatus(responseValue: unknown, setStatus: ResponseStatus): number | null {
  if (responseValue instanceof Response) return responseValue.status;
  if (typeof setStatus === "string") return StatusMap[setStatus];
  return setStatus ?? null;
}

function readReturnedErrorCode(responseValue: unknown): ApiErrorCode | undefined {
  if (!(responseValue instanceof ElysiaCustomStatusResponse)) return undefined;
  const body = apiErrorSchema.safeParse(responseValue.response);
  return body.success ? body.data.code : undefined;
}

export function createApp({ db, logger, webPublicUrl }: AppDependencies) {
  const requestStartMap = new WeakMap<Request, number>();
  const errorCodeMap = new WeakMap<Request, ApiErrorCode>();
  return new Elysia()
    .use(cors({ origin: new URL(webPublicUrl).origin }))
    .onRequest(({ request }) => {
      requestStartMap.set(request, performance.now());
    })
    .onError(({ code, error, request, set }) => {
      const response = toApiErrorResponse(code, error);
      errorCodeMap.set(request, response.body.code);
      if (response.status >= 500) {
        logger.error(
          { errorCode: response.body.code, errorName: errorNameOf(error) },
          "erro inesperado",
        );
        logger.debug({ err: error }, "detalhe do erro inesperado");
      }
      set.status = response.status;
      return response.body;
    })
    .onAfterResponse(({ request, route, set, responseValue }) => {
      const startTime = requestStartMap.get(request);
      const errorCode = errorCodeMap.get(request) ?? readReturnedErrorCode(responseValue);
      logger.info(
        {
          method: request.method,
          route: route || UNMATCHED_ROUTE,
          status: readResponseStatus(responseValue, set.status),
          ...(errorCode === undefined ? {} : { errorCode }),
          durationMs: startTime === undefined ? null : Math.round(performance.now() - startTime),
        },
        "request",
      );
    })
    .use(createHealthRoutes({ db, logger }));
}

export type App = ReturnType<typeof createApp>;

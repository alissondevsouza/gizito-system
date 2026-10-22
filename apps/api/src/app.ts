import { randomBytes } from "node:crypto";
import { cors } from "@elysiajs/cors";
import {
  type ApiErrorCode,
  apiErrorSchema,
  errorNameOf,
  MAX_ORDER_UPLOAD_BYTES,
  type ObjectStorage,
} from "@gizito/core";
import type { Database } from "@gizito/db";
import type { Logger, PhotoNormalizer } from "@gizito/integrations";
import { Elysia, ElysiaCustomStatusResponse, StatusMap, status } from "elysia";
import { payloadTooLargeError, toApiErrorResponse } from "#src/errors.ts";
import { createHealthRoutes } from "#src/routes/health.ts";
import { createOrderRoutes } from "#src/routes/orders.ts";

export const UNMATCHED_ROUTE = "unmatched";
export const SERVER_MAX_REQUEST_BODY_BYTES = 2 * MAX_ORDER_UPLOAD_BYTES;

export type AppDependencies = {
  db: Database;
  logger: Logger;
  webPublicUrl: string;
  storage: ObjectStorage;
  normalizePhoto: PhotoNormalizer;
  clientHashSecret: string;
  trustedProxyHopCount: number;
  isSecureCookie: boolean;
  now?: () => Date;
  randomBytes?: (length: number) => Uint8Array;
};

const defaultRandomBytes = (length: number) => new Uint8Array(randomBytes(length));

function exceedsUploadLimit(request: Request): boolean {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  return Number.isFinite(contentLength) && contentLength > MAX_ORDER_UPLOAD_BYTES;
}

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

export function createApp({
  db,
  logger,
  webPublicUrl,
  now = () => new Date(),
  randomBytes: drawRandomBytes = defaultRandomBytes,
  ...orderDependencies
}: AppDependencies) {
  const requestStartMap = new WeakMap<Request, number>();
  const errorCodeMap = new WeakMap<Request, ApiErrorCode>();
  return new Elysia({ serve: { maxRequestBodySize: SERVER_MAX_REQUEST_BODY_BYTES } })
    .use(cors({ origin: new URL(webPublicUrl).origin, credentials: true }))
    .onRequest(({ request }) => {
      requestStartMap.set(request, performance.now());
      if (exceedsUploadLimit(request)) throw status(413, payloadTooLargeError);
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
    .use(createHealthRoutes({ db, logger }))
    .use(
      createOrderRoutes({
        ...orderDependencies,
        db,
        logger,
        now,
        randomBytes: drawRandomBytes,
      }),
    );
}

export type App = ReturnType<typeof createApp>;

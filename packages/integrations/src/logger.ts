import type { LogLevel } from "@gizito/core";
import {
  type Bindings,
  type ChildLoggerOptions,
  type DestinationStream,
  type Logger,
  type LoggerOptions,
  pino,
} from "pino";
import { serializeLogError } from "#src/log-error.ts";

export type { Logger } from "pino";

export const redactedLogKeyList = [
  "email",
  "phone",
  "whatsappPhone",
  "payerEmail",
  "recipient",
  "token",
  "publicToken",
  "payload",
  "text",
  "textBody",
  "noteText",
  "otherTopicText",
  "userText",
  "qrCode",
  "qrCodeBase64",
  "rawBody",
  "authorization",
  "cookie",
  "secret",
  "apiKey",
  "accessToken",
  "password",
  "shortCode",
  "orderUrl",
  "url",
  "signedUrl",
  "downloadUrl",
  "mediaUrl",
] as const;

export const REDACTED_LOG_VALUE = "[redacted]";
export const DEPTH_LIMIT_LOG_VALUE = "[depth limit]";
export const BINARY_LOG_VALUE = "[binary]";
export const MAX_LOG_DEPTH = 6;

const ERROR_LOG_KEY = "err";

function normalizeLogKey(key: string): string {
  return key.replaceAll(/[_-]/g, "").toLowerCase();
}

const redactedLogKeySet: ReadonlySet<string> = new Set(redactedLogKeyList.map(normalizeLogKey));

function isRedactedLogKey(key: string): boolean {
  return redactedLogKeySet.has(normalizeLogKey(key));
}

function maskLogField(key: string, value: unknown, depth: number): unknown {
  return isRedactedLogKey(key) ? REDACTED_LOG_VALUE : maskLogValue(value, depth);
}

function maskLogEntry(entry: object, depth: number): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(entry).map(([key, value]) => [key, maskLogField(key, value, depth + 1)]),
  );
}

function maskLogValue(value: unknown, depth: number): unknown {
  if (value instanceof Error) return serializeLogError(value);
  if (value === null || typeof value !== "object" || value instanceof Date) return value;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return BINARY_LOG_VALUE;
  if (depth > MAX_LOG_DEPTH) return DEPTH_LIMIT_LOG_VALUE;
  if (Array.isArray(value)) return value.map((item) => maskLogValue(item, depth + 1));
  return maskLogEntry(value, depth);
}

function maskLogObject(object: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(object).map(([key, value]) => [
      key,
      key === ERROR_LOG_KEY ? value : maskLogField(key, value, 1),
    ]),
  );
}

export type CreateLoggerOptions = {
  service: string;
  level: LogLevel;
  destination?: DestinationStream;
};

type CreateChildLogger = (this: Logger, bindings: Bindings, options?: ChildLoggerOptions) => Logger;

function maskChildBindings(logger: Logger, createChild: CreateChildLogger = logger.child): Logger {
  return Object.defineProperty(logger, "child", {
    value: (bindings: Bindings, options?: ChildLoggerOptions) =>
      maskChildBindings(createChild.call(logger, maskLogObject(bindings), options), createChild),
  });
}

export function createLogger({ service, level, destination }: CreateLoggerOptions): Logger {
  const options: LoggerOptions = {
    level,
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: { [ERROR_LOG_KEY]: serializeLogError },
    formatters: { log: maskLogObject },
  };
  return maskChildBindings(destination ? pino(options, destination) : pino(options));
}

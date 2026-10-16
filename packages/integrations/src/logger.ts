import type { LogLevel } from "@gizito/core";
import { type DestinationStream, type Logger, type LoggerOptions, pino } from "pino";

export type { Logger } from "pino";

export const redactedLogKeyList = [
  "email",
  "phone",
  "token",
  "publicToken",
  "payload",
  "text",
] as const;

export const REDACTED_LOG_VALUE = "[redacted]";

export type CreateLoggerOptions = {
  service: string;
  level: LogLevel;
  destination?: DestinationStream;
};

export function createLogger({ service, level, destination }: CreateLoggerOptions): Logger {
  const options: LoggerOptions = {
    level,
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: redactedLogKeyList.flatMap((key) => [key, `*.${key}`]),
      censor: REDACTED_LOG_VALUE,
    },
  };
  return destination ? pino(options, destination) : pino(options);
}

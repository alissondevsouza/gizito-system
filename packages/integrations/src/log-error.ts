export type SerializedLogError = {
  type: string;
  message: string;
  stack?: string;
  code?: string;
  cause?: SerializedLogError;
};

const MAX_CAUSE_DEPTH = 3;

export const MAX_LOG_TEXT_LENGTH = 4000;
export const TRUNCATED_LOG_TEXT_MARK = "[truncated]";
export const QUERY_ERROR_MESSAGE = "Failed query";

const emailPattern = /[^\s@"'<>()[\]=,;:]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}/g;
const tokenPattern = /[A-Za-z0-9_-]{32,}/g;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const brazilianPhonePattern =
  /(?<![\w+-])(?:\+?55[\s-]?)?(?:\(\d{2}\)|\d{2})[\s-]?9?\d{4}[\s-]?\d{4}(?![\w-])/g;
const e164PhonePattern = /(?<![\w+])\+[1-9]\d{7,14}(?!\d)/g;
const whitespacePattern = /\s/;

const scrubRuleList: readonly (readonly [RegExp, (match: string) => string])[] = [
  [emailPattern, () => "[email]"],
  [tokenPattern, (match) => (uuidPattern.test(match) ? match : "[token]")],
  [brazilianPhonePattern, () => "[phone]"],
  [e164PhonePattern, () => "[phone]"],
];

function truncateLogText(text: string): string {
  if (text.length <= MAX_LOG_TEXT_LENGTH) return text;
  const kept = text.slice(0, MAX_LOG_TEXT_LENGTH);
  let partialWordStart = kept.length;
  while (partialWordStart > 0 && !whitespacePattern.test(kept.charAt(partialWordStart - 1))) {
    partialWordStart -= 1;
  }
  const withoutPartialWord = partialWordStart === 0 ? kept : kept.slice(0, partialWordStart);
  return `${withoutPartialWord}${TRUNCATED_LOG_TEXT_MARK}`;
}

export function scrubLogText(text: string): string {
  return scrubRuleList.reduce(
    (scrubbed, [pattern, replace]) => scrubbed.replace(pattern, replace),
    truncateLogText(text),
  );
}

function readErrorCode(error: Error): string | undefined {
  if (!("code" in error)) return undefined;
  const { code } = error;
  return typeof code === "string" || typeof code === "number" ? String(code) : undefined;
}

function isQueryError(error: Error): boolean {
  return "query" in error && "params" in error;
}

function replaceStackMessage(error: Error, stack: string): string {
  const messageIndex = error.message === "" ? -1 : stack.indexOf(error.message);
  const frameText = messageIndex === -1 ? "" : stack.slice(messageIndex + error.message.length);
  return `${error.name}: ${QUERY_ERROR_MESSAGE}${frameText}`;
}

function readLogMessage(error: Error): string {
  return isQueryError(error) ? QUERY_ERROR_MESSAGE : scrubLogText(error.message);
}

function readLogStack(error: Error): string | undefined {
  if (error.stack === undefined) return undefined;
  return scrubLogText(isQueryError(error) ? replaceStackMessage(error, error.stack) : error.stack);
}

export function serializeLogError(error: unknown, depth = 0): SerializedLogError {
  if (!(error instanceof Error)) return { type: typeof error, message: "[non-error value]" };
  const code = readErrorCode(error);
  const stack = readLogStack(error);
  return {
    type: error.name,
    message: readLogMessage(error),
    ...(stack === undefined ? {} : { stack }),
    ...(code === undefined ? {} : { code }),
    ...(error.cause === undefined || depth >= MAX_CAUSE_DEPTH
      ? {}
      : { cause: serializeLogError(error.cause, depth + 1) }),
  };
}

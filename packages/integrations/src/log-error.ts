export type SerializedLogError = {
  type: string;
  message: string;
  stack?: string;
  code?: string;
  cause?: SerializedLogError;
};

const MAX_CAUSE_DEPTH = 3;

const scrubRuleList: readonly (readonly [RegExp, string])[] = [
  [/[^\s@"'<>()[\]=]+@[^\s@"'<>()[\]]+\.[A-Za-z]{2,}/g, "[email]"],
  [/[A-Za-z0-9_-]{32,}/g, "[token]"],
  [/\+?\d[\d\s().-]{8,}\d/g, "[phone]"],
];

export function scrubLogText(text: string): string {
  return scrubRuleList.reduce(
    (scrubbed, [pattern, replacement]) => scrubbed.replace(pattern, replacement),
    text,
  );
}

function readErrorCode(error: Error): string | undefined {
  if (!("code" in error)) return undefined;
  const { code } = error;
  return typeof code === "string" || typeof code === "number" ? String(code) : undefined;
}

export function serializeLogError(error: unknown, depth = 0): SerializedLogError {
  if (!(error instanceof Error)) return { type: typeof error, message: "[non-error value]" };
  const code = readErrorCode(error);
  return {
    type: error.name,
    message: scrubLogText(error.message),
    ...(error.stack === undefined ? {} : { stack: scrubLogText(error.stack) }),
    ...(code === undefined ? {} : { code }),
    ...(error.cause === undefined || depth >= MAX_CAUSE_DEPTH
      ? {}
      : { cause: serializeLogError(error.cause, depth + 1) }),
  };
}

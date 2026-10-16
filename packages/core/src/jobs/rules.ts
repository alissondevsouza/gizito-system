import {
  JOB_LOCK_TIMEOUT_SECONDS,
  JOB_MAX_ATTEMPT_COUNT,
  JOB_RETRY_DELAY_SECONDS_LIST,
} from "#src/constants.ts";
import type { JobName } from "#src/enums.ts";
import type { JobPayloadByName } from "#src/jobs/schemas.ts";

const MILLISECONDS_PER_SECOND = 1000;

export const jobErrorCodeMap = {
  payloadInvalid: "payload_invalid",
  lockExpired: "lock_expired",
  unhandledError: "unhandled_error",
} as const;

export function jobRetryDelaySeconds(
  attemptCount: number,
  maxAttemptCount: number = JOB_MAX_ATTEMPT_COUNT,
): number | null {
  if (attemptCount >= maxAttemptCount) return null;
  const delayIndex = Math.min(Math.max(attemptCount, 1), JOB_RETRY_DELAY_SECONDS_LIST.length) - 1;
  return JOB_RETRY_DELAY_SECONDS_LIST[delayIndex] ?? null;
}

export function nextJobRunAfterDatetime(
  attemptCount: number,
  now: Date,
  maxAttemptCount: number = JOB_MAX_ATTEMPT_COUNT,
): Date | null {
  const delaySeconds = jobRetryDelaySeconds(attemptCount, maxAttemptCount);
  if (delaySeconds === null) return null;
  return new Date(now.getTime() + delaySeconds * MILLISECONDS_PER_SECOND);
}

export function jobLockExpireDatetime(
  now: Date,
  lockTimeoutSeconds: number = JOB_LOCK_TIMEOUT_SECONDS,
): Date {
  return new Date(now.getTime() + lockTimeoutSeconds * MILLISECONDS_PER_SECOND);
}

export const personalDataJobNameList = ["whatsapp.inbound"] as const satisfies readonly JobName[];
export type PersonalDataJobName = (typeof personalDataJobNameList)[number];

export const personalDataJobRetainedFieldMap: {
  readonly [N in PersonalDataJobName]: readonly (keyof JobPayloadByName<N>)[];
} = {
  "whatsapp.inbound": ["name", "webhookEventId"],
};

export function isPersonalDataJob(name: JobName): name is PersonalDataJobName {
  return personalDataJobNameList.some((candidate) => candidate === name);
}

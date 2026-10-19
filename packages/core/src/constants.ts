import type { Difficulty } from "#src/enums.ts";

export const KIT_PRICE_CENTS = 2990;

export const MIN_PHOTO_COUNT = 1;
export const MAX_PHOTO_COUNT = 5;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export const MIN_TOPIC_COUNT = 1;
export const MAX_TOPIC_COUNT = 3;

export const WORKED_EXAMPLE_COUNT = 2;
export const PRACTICE_QUESTION_COUNT = 10;
export const MOCK_QUESTION_COUNT = 10;
export const ANSWER_KEY_COUNT = PRACTICE_QUESTION_COUNT + MOCK_QUESTION_COUNT;

export type DifficultyDistribution = Readonly<Record<Difficulty, number>>;
export const PRACTICE_DIFFICULTY_DISTRIBUTION: DifficultyDistribution = {
  easy: 4,
  medium: 4,
  hard: 2,
};
export const MOCK_DIFFICULTY_DISTRIBUTION: DifficultyDistribution = {
  easy: 3,
  medium: 4,
  hard: 3,
};
export const MAX_PERCEIVED_DIFFICULTY_SHIFT = 1;

export type TopicCount = 1 | 2 | 3;
export const MIN_QUESTION_COUNT_PER_TOPIC_PER_BLOCK: Readonly<Record<TopicCount, number>> = {
  1: PRACTICE_QUESTION_COUNT,
  2: 4,
  3: 3,
};

export const MAX_REGENERATION_COUNT = 1;

export const JOB_RETRY_DELAY_SECONDS_LIST = [30, 120, 480] as const;
export const JOB_MAX_ATTEMPT_COUNT = JOB_RETRY_DELAY_SECONDS_LIST.length + 1;
export const JOB_LOCK_TIMEOUT_SECONDS = 2 * 60;
export const JOB_LEASE_RENEW_INTERVAL_SECONDS = 30;
export const JOB_MAX_RUN_SECONDS = 15 * 60;
export const JOB_FAILED_METRIC_WINDOW_HOURS = 24;

export const CHARGE_TTL_MINUTES = 30;
export const CHARGE_RECONCILE_INTERVAL_MINUTES = 2;
export const CHARGE_RECONCILE_MIN_AGE_MINUTES = 1;

export const PHOTO_RETENTION_DAYS = 30;
export const KIT_RETENTION_MONTHS = 12;
export const RETENTION_PURGE_INTERVAL_HOURS = 24;

export const MAX_NOTE_LENGTH = 300;
export const MAX_OTHER_TOPIC_LENGTH = 80;
export const MAX_EMAIL_LENGTH = 254;

export const PUBLIC_TOKEN_BYTES = 32;
export const PUBLIC_TOKEN_LENGTH = 43;
export const SHORT_CODE_PREFIX = "GZ-";
export const SHORT_CODE_LENGTH = 6;
export const SHORT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const MAX_WHATSAPP_INBOUND_TEXT_LENGTH = 1000;
export const WHATSAPP_HELP_REPLY_WINDOW_HOURS = 24;
export const WHATSAPP_STOP_WORD_LIST = ["SAIR", "PARAR"] as const;

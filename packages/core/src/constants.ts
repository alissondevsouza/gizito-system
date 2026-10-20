import type { Difficulty, Grade, Legibility, PerceivedDifficulty } from "#src/enums.ts";

export const KIT_PRICE_CENTS = 2990;

export const MIN_PHOTO_COUNT = 1;
export const MAX_PHOTO_COUNT = 5;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export const AI_IMAGE_MAX_SIDE_PX = 1600;
export const AI_IMAGE_JPEG_QUALITY = 80;

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
export const MAX_REPAIR_ITEM_COUNT = 8;

export const OTHER_TOPIC_REF = "other";

export const MAX_TOPIC_CANDIDATE_COUNT = 6;
export const MAX_EVIDENCE_LENGTH = 120;
export const EXTRACT_OUTPUT_RETRY_COUNT = 1;
export const MAX_TERMINOLOGY_COUNT = 10;
export const MAX_TERM_LENGTH = 40;
export const MAX_CONTEXT_THEME_COUNT = 5;
export const LEGIBILITY_SCORE_MAP: Readonly<Record<Legibility, number>> = {
  good: 1,
  partial: 0.5,
  unreadable: 0,
};

export type ShiftDirection = -1 | 0 | 1;
export const PERCEIVED_DIFFICULTY_SHIFT_DIRECTION_MAP: Readonly<
  Record<PerceivedDifficulty, ShiftDirection>
> = {
  basic: 1,
  intermediate: -1,
  unknown: 0,
};

export const MULTIPLE_CHOICE_OPTION_COUNT = 4;
export const MIN_MULTIPLE_CHOICE_PER_BLOCK = 3;
export const MAX_MULTIPLE_CHOICE_PER_BLOCK = 7;
export const MIN_CONTEXTUALIZED_MATH_MOCK_COUNT = 6;
export const MIN_MOCK_BASE_TEXT_COUNT = 1;
export const MAX_MOCK_BASE_TEXT_COUNT = 2;
export const MAX_PRACTICE_BASE_TEXT_COUNT = 1;
export const MAX_BASE_TEXT_COUNT = MAX_MOCK_BASE_TEXT_COUNT + MAX_PRACTICE_BASE_TEXT_COUNT;
export const MIN_MOCK_SUGGESTED_MINUTES = 20;
export const MAX_MOCK_SUGGESTED_MINUTES = 60;

export const MAX_NON_COMPUTABLE_MATH_QUESTION_COUNT = 6;
export const UNIT_CONVERSION_FACTOR_LIST = [10, 100, 1000, 60, 24, 7, 12] as const;
export const DUPLICATE_SIMILARITY_THRESHOLD = 0.8;

export type CountRange = { readonly min: number; readonly max: number };
export const MAX_STATEMENT_WORD_COUNT_BY_GRADE: Readonly<Record<Grade, number>> = {
  "4": 60,
  "5": 70,
  "6": 90,
  "7": 100,
};
export const BASE_TEXT_WORD_RANGE_BY_GRADE: Readonly<Record<Grade, CountRange>> = {
  "4": { min: 100, max: 220 },
  "5": { min: 120, max: 260 },
  "6": { min: 150, max: 320 },
  "7": { min: 180, max: 380 },
};
export const ACTIVITIES_PAGE_RANGE: CountRange = { min: 8, max: 14 };
export const ANSWER_KEY_PAGE_RANGE: CountRange = { min: 3, max: 6 };

export const STUDY_KIT_FORMAT_VERSION = "kit-v1";
export const MAX_REVIEW_NOTE_LENGTH = 200;
export const MAX_ISSUE_EXCERPT_LENGTH = 80;

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

import { describe, expect, it } from "bun:test";
import {
  ACTIVITIES_PAGE_RANGE,
  ANSWER_KEY_COUNT,
  ANSWER_KEY_PAGE_RANGE,
  BASE_TEXT_WORD_RANGE_BY_GRADE,
  CHARGE_TTL_MINUTES,
  DUPLICATE_SIMILARITY_THRESHOLD,
  EXTRACT_OUTPUT_RETRY_COUNT,
  JOB_FAILED_METRIC_WINDOW_HOURS,
  KIT_PRICE_CENTS,
  KIT_RETENTION_MONTHS,
  LEGIBILITY_SCORE_MAP,
  MAX_AI_COST_CENTS_PER_ORDER,
  MAX_BASE_TEXT_COUNT,
  MAX_CONTEXT_THEME_COUNT,
  MAX_EVIDENCE_LENGTH,
  MAX_ISSUE_EXCERPT_LENGTH,
  MAX_MOCK_BASE_TEXT_COUNT,
  MAX_MOCK_SUGGESTED_MINUTES,
  MAX_MULTIPLE_CHOICE_PER_BLOCK,
  MAX_NON_COMPUTABLE_MATH_QUESTION_COUNT,
  MAX_NOTE_LENGTH,
  MAX_PERCEIVED_DIFFICULTY_SHIFT,
  MAX_PHOTO_BYTES,
  MAX_PHOTO_COUNT,
  MAX_PRACTICE_BASE_TEXT_COUNT,
  MAX_REPAIR_ITEM_COUNT,
  MAX_REVIEW_NOTE_LENGTH,
  MAX_STATEMENT_WORD_COUNT_BY_GRADE,
  MAX_TERM_LENGTH,
  MAX_TERMINOLOGY_COUNT,
  MAX_TOPIC_CANDIDATE_COUNT,
  MAX_TOPIC_COUNT,
  MIN_CONTEXTUALIZED_MATH_MOCK_COUNT,
  MIN_MOCK_BASE_TEXT_COUNT,
  MIN_MOCK_SUGGESTED_MINUTES,
  MIN_MULTIPLE_CHOICE_PER_BLOCK,
  MIN_QUESTION_COUNT_PER_TOPIC_PER_BLOCK,
  MOCK_DIFFICULTY_DISTRIBUTION,
  MOCK_QUESTION_COUNT,
  MULTIPLE_CHOICE_OPTION_COUNT,
  OTHER_TOPIC_REF,
  PERCEIVED_DIFFICULTY_SHIFT_DIRECTION_MAP,
  PHOTO_RETENTION_DAYS,
  PRACTICE_DIFFICULTY_DISTRIBUTION,
  PRACTICE_QUESTION_COUNT,
  PUBLIC_TOKEN_BYTES,
  PUBLIC_TOKEN_LENGTH,
  RETENTION_PURGE_INTERVAL_HOURS,
  REVIEW_OUTPUT_RETRY_COUNT,
  SHORT_CODE_ALPHABET,
  SHORT_CODE_LENGTH,
  STUDY_KIT_FORMAT_VERSION,
  UNIT_CONVERSION_FACTOR_LIST,
  WORKED_EXAMPLE_COUNT,
} from "#src/constants.ts";
import { gradeList } from "#src/enums.ts";

const sum = (distribution: Record<string, number>) =>
  Object.values(distribution).reduce((total, count) => total + count, 0);

describe("constantes de negócio (PRD §5, §6 e §7)", () => {
  it("preço do kit é R$ 29,90", () => {
    expect(KIT_PRICE_CENTS).toBe(2990);
  });

  it("limites de entrada do PRD §6", () => {
    expect(MAX_PHOTO_COUNT).toBe(5);
    expect(MAX_PHOTO_BYTES).toBe(8 * 1024 * 1024);
    expect(MAX_TOPIC_COUNT).toBe(3);
    expect(MAX_NOTE_LENGTH).toBe(300);
  });

  it("contagens do kit do PRD §7.2", () => {
    expect(WORKED_EXAMPLE_COUNT).toBe(2);
    expect(PRACTICE_QUESTION_COUNT).toBe(10);
    expect(MOCK_QUESTION_COUNT).toBe(10);
    expect(ANSWER_KEY_COUNT).toBe(PRACTICE_QUESTION_COUNT + MOCK_QUESTION_COUNT);
  });

  it("distribuições de dificuldade somam o tamanho do bloco", () => {
    expect(PRACTICE_DIFFICULTY_DISTRIBUTION).toEqual({ easy: 4, medium: 4, hard: 2 });
    expect(MOCK_DIFFICULTY_DISTRIBUTION).toEqual({ easy: 3, medium: 4, hard: 3 });
    expect(sum(PRACTICE_DIFFICULTY_DISTRIBUTION)).toBe(PRACTICE_QUESTION_COUNT);
    expect(sum(MOCK_DIFFICULTY_DISTRIBUTION)).toBe(MOCK_QUESTION_COUNT);
  });

  it("cobertura mínima por assunto e bloco cabe no bloco", () => {
    expect(MIN_QUESTION_COUNT_PER_TOPIC_PER_BLOCK).toEqual({ 1: 10, 2: 4, 3: 3 });
    for (const topicCount of [1, 2, 3] as const) {
      const minimum = MIN_QUESTION_COUNT_PER_TOPIC_PER_BLOCK[topicCount] * topicCount;
      expect(minimum).toBeLessThanOrEqual(PRACTICE_QUESTION_COUNT);
      expect(minimum).toBeLessThanOrEqual(MOCK_QUESTION_COUNT);
    }
  });

  it("prazos do PRD §9.1 e da retenção", () => {
    expect(CHARGE_TTL_MINUTES).toBe(30);
    expect(PHOTO_RETENTION_DAYS).toBe(30);
    expect(KIT_RETENTION_MONTHS).toBe(12);
    expect(RETENTION_PURGE_INTERVAL_HOURS).toBe(24);
    expect(JOB_FAILED_METRIC_WINDOW_HOURS).toBe(24);
  });

  it("identificadores do pedido", () => {
    expect(PUBLIC_TOKEN_LENGTH).toBe(Math.ceil((PUBLIC_TOKEN_BYTES * 4) / 3));
    expect(SHORT_CODE_LENGTH).toBe(6);
    expect(SHORT_CODE_ALPHABET).not.toMatch(/[0O1I]/);
    expect(new Set(SHORT_CODE_ALPHABET).size).toBe(SHORT_CODE_ALPHABET.length);
  });
});

describe("constantes da spec pedagógica (§11)", () => {
  it("têm os valores propostos", () => {
    expect(OTHER_TOPIC_REF).toBe("other");
    expect(MAX_TOPIC_CANDIDATE_COUNT).toBe(6);
    expect(MAX_EVIDENCE_LENGTH).toBe(120);
    expect(EXTRACT_OUTPUT_RETRY_COUNT).toBe(1);
    expect([MAX_TERMINOLOGY_COUNT, MAX_TERM_LENGTH, MAX_CONTEXT_THEME_COUNT]).toEqual([10, 40, 5]);
    expect(LEGIBILITY_SCORE_MAP).toEqual({ good: 1, partial: 0.5, unreadable: 0 });
    expect(PERCEIVED_DIFFICULTY_SHIFT_DIRECTION_MAP).toEqual({
      basic: 1,
      intermediate: -1,
      unknown: 0,
    });
    expect(MULTIPLE_CHOICE_OPTION_COUNT).toBe(4);
    expect([MIN_MULTIPLE_CHOICE_PER_BLOCK, MAX_MULTIPLE_CHOICE_PER_BLOCK]).toEqual([3, 7]);
    expect(MIN_CONTEXTUALIZED_MATH_MOCK_COUNT).toBe(6);
    expect([
      MIN_MOCK_BASE_TEXT_COUNT,
      MAX_MOCK_BASE_TEXT_COUNT,
      MAX_PRACTICE_BASE_TEXT_COUNT,
    ]).toEqual([1, 2, 1]);
    expect(MAX_BASE_TEXT_COUNT).toBe(3);
    expect([MIN_MOCK_SUGGESTED_MINUTES, MAX_MOCK_SUGGESTED_MINUTES]).toEqual([20, 60]);
    expect(MAX_NON_COMPUTABLE_MATH_QUESTION_COUNT).toBe(6);
    expect(UNIT_CONVERSION_FACTOR_LIST).toEqual([10, 100, 1000, 60, 24, 7, 12]);
    expect(DUPLICATE_SIMILARITY_THRESHOLD).toBe(0.8);
    expect(MAX_STATEMENT_WORD_COUNT_BY_GRADE).toEqual({ "4": 60, "5": 70, "6": 90, "7": 100 });
    expect(BASE_TEXT_WORD_RANGE_BY_GRADE).toEqual({
      "4": { min: 100, max: 220 },
      "5": { min: 120, max: 260 },
      "6": { min: 150, max: 320 },
      "7": { min: 180, max: 380 },
    });
    expect(MAX_REPAIR_ITEM_COUNT).toBe(8);
    expect(REVIEW_OUTPUT_RETRY_COUNT).toBe(1);
    expect(MAX_AI_COST_CENTS_PER_ORDER).toBe(200);
    expect(ACTIVITIES_PAGE_RANGE).toEqual({ min: 8, max: 14 });
    expect(ANSWER_KEY_PAGE_RANGE).toEqual({ min: 3, max: 6 });
    expect(STUDY_KIT_FORMAT_VERSION).toBe("kit-v1");
    expect([MAX_REVIEW_NOTE_LENGTH, MAX_ISSUE_EXCERPT_LENGTH]).toEqual([200, 80]);
  });

  it("mapas por ano cobrem os quatro anos e faixas são coerentes", () => {
    for (const grade of gradeList) {
      expect(MAX_STATEMENT_WORD_COUNT_BY_GRADE[grade]).toBeGreaterThan(0);
      const range = BASE_TEXT_WORD_RANGE_BY_GRADE[grade];
      expect(range.min).toBeLessThanOrEqual(range.max);
    }
    expect(ACTIVITIES_PAGE_RANGE.min).toBeLessThanOrEqual(ACTIVITIES_PAGE_RANGE.max);
    expect(ANSWER_KEY_PAGE_RANGE.min).toBeLessThanOrEqual(ANSWER_KEY_PAGE_RANGE.max);
  });

  it("limites cabem nos blocos", () => {
    expect(MAX_REPAIR_ITEM_COUNT).toBeLessThan(ANSWER_KEY_COUNT + WORKED_EXAMPLE_COUNT);
    expect(MAX_MULTIPLE_CHOICE_PER_BLOCK).toBeLessThanOrEqual(PRACTICE_QUESTION_COUNT);
    expect(MIN_CONTEXTUALIZED_MATH_MOCK_COUNT).toBeLessThanOrEqual(MOCK_QUESTION_COUNT);
    expect(MAX_NON_COMPUTABLE_MATH_QUESTION_COUNT).toBeLessThan(ANSWER_KEY_COUNT);
    for (const direction of Object.values(PERCEIVED_DIFFICULTY_SHIFT_DIRECTION_MAP)) {
      expect(Math.abs(direction * MAX_PERCEIVED_DIFFICULTY_SHIFT)).toBeLessThanOrEqual(1);
    }
  });
});

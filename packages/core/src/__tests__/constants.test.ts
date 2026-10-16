import { describe, expect, it } from "bun:test";
import {
  ANSWER_KEY_COUNT,
  CHARGE_TTL_MINUTES,
  KIT_PRICE_CENTS,
  KIT_RETENTION_MONTHS,
  MAX_NOTE_LENGTH,
  MAX_PHOTO_BYTES,
  MAX_PHOTO_COUNT,
  MAX_TOPIC_COUNT,
  MIN_QUESTION_COUNT_PER_TOPIC_PER_BLOCK,
  MOCK_DIFFICULTY_DISTRIBUTION,
  MOCK_QUESTION_COUNT,
  PHOTO_RETENTION_DAYS,
  PRACTICE_DIFFICULTY_DISTRIBUTION,
  PRACTICE_QUESTION_COUNT,
  PUBLIC_TOKEN_BYTES,
  PUBLIC_TOKEN_LENGTH,
  RETENTION_PURGE_INTERVAL_HOURS,
  SHORT_CODE_ALPHABET,
  SHORT_CODE_LENGTH,
  WORKED_EXAMPLE_COUNT,
} from "#src/constants.ts";

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
  });

  it("identificadores do pedido", () => {
    expect(PUBLIC_TOKEN_LENGTH).toBe(Math.ceil((PUBLIC_TOKEN_BYTES * 4) / 3));
    expect(SHORT_CODE_LENGTH).toBe(6);
    expect(SHORT_CODE_ALPHABET).not.toMatch(/[0O1I]/);
    expect(new Set(SHORT_CODE_ALPHABET).size).toBe(SHORT_CODE_ALPHABET.length);
  });
});

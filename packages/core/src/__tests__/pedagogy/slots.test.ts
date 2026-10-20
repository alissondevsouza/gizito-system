import { describe, expect, it } from "bun:test";
import {
  MIN_QUESTION_COUNT_PER_TOPIC_PER_BLOCK,
  MOCK_QUESTION_COUNT,
  PRACTICE_QUESTION_COUNT,
  type TopicCount,
} from "#src/constants.ts";
import { type Difficulty, perceivedDifficultyList, questionBlockList } from "#src/enums.ts";
import {
  InvalidTopicRefListError,
  type KitSlotPlan,
  planKitSlots,
  type QuestionSlot,
  shiftedDifficultyDistribution,
} from "#src/pedagogy/slots.ts";

const A = "ma5-fractions";
const B = "ma5-percentage";
const C = "other";

const short = { easy: "fácil", medium: "intermediária", hard: "desafiadora" } as const;
const letterOf: Record<string, string> = { [A]: "A", [B]: "B", [C]: "C" };

function describeSlotList(slotList: readonly QuestionSlot[]): string[] {
  return slotList.map(
    (slot) => `${slot.slotId} ${letterOf[slot.topicRef]} ${short[slot.difficulty]}`,
  );
}

function plan(...args: Parameters<typeof planKitSlots>): KitSlotPlan {
  const result = planKitSlots(...args);
  if (!result.ok) throw result.error;
  return result.value;
}

describe("planKitSlots (spec pedagógica §5)", () => {
  it("resultado de referência com 3 assuntos e sem dificuldade percebida", () => {
    const kitSlotPlan = plan([A, B, C], null);
    expect(describeSlotList(kitSlotPlan.practiceSlotList)).toEqual([
      "p1 A fácil",
      "p2 A fácil",
      "p3 A intermediária",
      "p4 A desafiadora",
      "p5 B fácil",
      "p6 B intermediária",
      "p7 B intermediária",
      "p8 C fácil",
      "p9 C intermediária",
      "p10 C desafiadora",
    ]);
    expect(describeSlotList(kitSlotPlan.mockSlotList)).toEqual([
      "m1 A fácil",
      "m2 B fácil",
      "m3 C fácil",
      "m4 A intermediária",
      "m5 B intermediária",
      "m6 C intermediária",
      "m7 A intermediária",
      "m8 B desafiadora",
      "m9 C desafiadora",
      "m10 A desafiadora",
    ]);
    expect(kitSlotPlan.workedExampleSlotList).toEqual([
      { exampleId: "e1", topicRef: A },
      { exampleId: "e2", topicRef: B },
    ]);
    expect(kitSlotPlan.reviewSectionTopicRefList).toEqual([A, B, C]);
  });

  it("resultado de referência com 2 assuntos", () => {
    const kitSlotPlan = plan([A, B], "unknown");
    expect(describeSlotList(kitSlotPlan.practiceSlotList)).toEqual([
      "p1 A fácil",
      "p2 A fácil",
      "p3 A intermediária",
      "p4 A intermediária",
      "p5 A desafiadora",
      "p6 B fácil",
      "p7 B fácil",
      "p8 B intermediária",
      "p9 B intermediária",
      "p10 B desafiadora",
    ]);
    expect(describeSlotList(kitSlotPlan.mockSlotList)).toEqual([
      "m1 A fácil",
      "m2 B fácil",
      "m3 A fácil",
      "m4 B intermediária",
      "m5 A intermediária",
      "m6 B intermediária",
      "m7 A intermediária",
      "m8 B desafiadora",
      "m9 A desafiadora",
      "m10 B desafiadora",
    ]);
  });

  it("1 assunto ocupa as 10 vagas de cada bloco e os dois exemplos", () => {
    const kitSlotPlan = plan([A], null);
    expect(kitSlotPlan.practiceSlotList.every((slot) => slot.topicRef === A)).toBe(true);
    expect(kitSlotPlan.mockSlotList.every((slot) => slot.topicRef === A)).toBe(true);
    expect(kitSlotPlan.workedExampleSlotList.map((slot) => slot.topicRef)).toEqual([A, A]);
  });

  it("dificuldade percebida desloca uma intermediária por bloco", () => {
    expect(shiftedDifficultyDistribution("practice", "basic")).toEqual({
      easy: 5,
      medium: 3,
      hard: 2,
    });
    expect(shiftedDifficultyDistribution("mock", "basic")).toEqual({ easy: 4, medium: 3, hard: 3 });
    expect(shiftedDifficultyDistribution("practice", "intermediate")).toEqual({
      easy: 3,
      medium: 5,
      hard: 2,
    });
    expect(shiftedDifficultyDistribution("mock", "intermediate")).toEqual({
      easy: 2,
      medium: 5,
      hard: 3,
    });
    expect(plan([A, B, C], "unknown")).toEqual(plan([A, B, C], null));
  });

  it("toda combinação respeita cobertura mínima e distribuição deslocada", () => {
    const topicRefListList = [[A], [A, B], [A, B, C]] as const;
    for (const topicRefList of topicRefListList) {
      for (const perceivedDifficulty of [...perceivedDifficultyList, null]) {
        const kitSlotPlan = plan(topicRefList, perceivedDifficulty);
        for (const block of questionBlockList) {
          const slotList =
            block === "practice" ? kitSlotPlan.practiceSlotList : kitSlotPlan.mockSlotList;
          expect(slotList).toHaveLength(
            block === "practice" ? PRACTICE_QUESTION_COUNT : MOCK_QUESTION_COUNT,
          );
          const minimum = MIN_QUESTION_COUNT_PER_TOPIC_PER_BLOCK[topicRefList.length as TopicCount];
          for (const topicRef of topicRefList) {
            expect(
              slotList.filter((slot) => slot.topicRef === topicRef).length,
            ).toBeGreaterThanOrEqual(minimum);
          }
          const countOf = (difficulty: Difficulty) =>
            slotList.filter((slot) => slot.difficulty === difficulty).length;
          expect({
            easy: countOf("easy"),
            medium: countOf("medium"),
            hard: countOf("hard"),
          }).toEqual(shiftedDifficultyDistribution(block, perceivedDifficulty));
        }
      }
    }
  });

  it("recusa lista vazia, com mais de 3 ou com assunto repetido, com erro tipado", () => {
    for (const topicRefList of [[], [A, B, C, "ma5-volume"], [A, A]]) {
      const result = planKitSlots(topicRefList, null);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBeInstanceOf(InvalidTopicRefListError);
    }
  });
});

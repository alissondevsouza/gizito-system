import { OTHER_TOPIC_REF } from "#src/constants.ts";
import type { PerceivedDifficulty, Subject } from "#src/enums.ts";
import { questionBlockOf, type TopicRef } from "#src/pedagogy/kit-item.ts";
import type { KitPlan, SlotDetail } from "#src/pedagogy/plan/schemas.ts";
import { type KitSlotPlan, planKitSlots } from "#src/pedagogy/slots.ts";

export const MATH_TOPIC_REF_LIST: readonly TopicRef[] = [
  "ma5-fractions",
  "ma5-perimeter-area",
  OTHER_TOPIC_REF,
];
export const PORTUGUESE_TOPIC_REF_LIST: readonly TopicRef[] = ["lp5-main-idea", "lp5-word-meaning"];
export const OTHER_TOPIC_LABEL = "Dinheiro e troco";

export function buildSlotPlan(
  topicRefList: readonly TopicRef[],
  perceivedDifficulty: PerceivedDifficulty | null = null,
): KitSlotPlan {
  const result = planKitSlots(topicRefList, perceivedDifficulty);
  if (!result.ok) throw result.error;
  return result.value;
}

function portugueseBaseTextIdOf(slotId: SlotDetail["slotId"], index: number) {
  if (questionBlockOf(slotId) === "mock") return index < 15 ? "t1" : "t2";
  return index < 3 ? "t3" : null;
}

export function buildKitPlan(kitSlotPlan: KitSlotPlan, subject: Subject): KitPlan {
  const slotList = [...kitSlotPlan.practiceSlotList, ...kitSlotPlan.mockSlotList];
  return {
    topicObjectiveList: kitSlotPlan.reviewSectionTopicRefList.map((topicRef) => ({
      topicRef,
      objectiveList: [`Resolver situações do assunto ${topicRef} com segurança`],
    })),
    slotDetailList: slotList.map((slot, index) => ({
      slotId: slot.slotId,
      questionType: index % 2 === 0 ? "multiple_choice" : "open_answer",
      isContextualized: subject === "math",
      skillFocus: `Habilidade trabalhada na vaga ${slot.slotId}`,
      baseTextId: subject === "math" ? null : portugueseBaseTextIdOf(slot.slotId, index),
    })),
    workedExampleFocusList: kitSlotPlan.workedExampleSlotList.map((slot) => ({
      exampleId: slot.exampleId,
      focus: `Mostrar o passo a passo do assunto ${slot.topicRef}`,
    })),
    baseTextBriefList:
      subject === "math"
        ? []
        : [
            { baseTextId: "t1", block: "mock", genre: "conto", theme: "uma viagem da turma" },
            { baseTextId: "t2", block: "mock", genre: "notícia", theme: "a horta da escola" },
            { baseTextId: "t3", block: "practice", genre: "fábula", theme: "o jabuti paciente" },
          ],
    styleGuideList: ["Usar situações de compras e de escola, como no material"],
    prerequisiteReminderList: [],
    otherTopicAssessment: kitSlotPlan.reviewSectionTopicRefList.includes(OTHER_TOPIC_REF)
      ? { verdict: "feasible", label: OTHER_TOPIC_LABEL, reasonCode: null }
      : null,
  };
}

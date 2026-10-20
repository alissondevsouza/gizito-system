import { describe, expect, it } from "bun:test";
import {
  buildKitPlan,
  buildSlotPlan,
  MATH_TOPIC_REF_LIST,
  PORTUGUESE_TOPIC_REF_LIST,
} from "#src/__tests__/__fixtures__/kit.ts";
import type { Subject } from "#src/enums.ts";
import type { KitPlan } from "#src/pedagogy/plan/schemas.ts";
import { validateKitPlan } from "#src/pedagogy/validation/plan.ts";

const mathSlotPlan = buildSlotPlan(MATH_TOPIC_REF_LIST);
const portugueseSlotPlan = buildSlotPlan(PORTUGUESE_TOPIC_REF_LIST);

function codesOf(output: unknown, subject: Subject): readonly string[] {
  const slotPlan = subject === "math" ? mathSlotPlan : portugueseSlotPlan;
  const result = validateKitPlan(output, slotPlan, subject);
  return result.ok ? [] : result.error.map((issue) => issue.code);
}

function mathPlan(change: (plan: KitPlan) => KitPlan = (plan) => plan): KitPlan {
  return change(buildKitPlan(mathSlotPlan, "math"));
}

function portuguesePlan(change: (plan: KitPlan) => KitPlan = (plan) => plan): KitPlan {
  return change(buildKitPlan(portugueseSlotPlan, "portuguese"));
}

function withSlotDetail(
  plan: KitPlan,
  change: (
    detail: KitPlan["slotDetailList"][number],
    index: number,
  ) => KitPlan["slotDetailList"][number],
): KitPlan {
  return { ...plan, slotDetailList: plan.slotDetailList.map(change) };
}

describe("validateKitPlan (spec pedagógica §6 e §8.1)", () => {
  it("planos válidos das duas disciplinas dão ok", () => {
    const result = validateKitPlan(mathPlan(), mathSlotPlan, "math");
    expect(result).toEqual({ ok: true, value: mathPlan() });
    expect(codesOf(portuguesePlan(), "portuguese")).toEqual([]);
  });

  it("plan_output_invalid: fora do schema, unfeasible sem motivo, avaliação do outro fora do lugar", () => {
    expect(codesOf({ ...mathPlan(), extra: true }, "math")).toEqual(["plan_output_invalid"]);
    expect(
      codesOf(
        mathPlan((plan) => ({ ...plan, slotDetailList: plan.slotDetailList.slice(1) })),
        "math",
      ),
    ).toEqual(["plan_output_invalid"]);
    expect(
      codesOf(
        mathPlan((plan) => ({
          ...plan,
          otherTopicAssessment: { verdict: "unfeasible", label: "Mapas", reasonCode: null },
        })),
        "math",
      ),
    ).toEqual(["plan_output_invalid"]);
    expect(
      codesOf(
        mathPlan((plan) => ({ ...plan, otherTopicAssessment: null })),
        "math",
      ),
    ).toEqual(["plan_output_invalid"]);
    expect(
      codesOf(
        portuguesePlan((plan) => ({
          ...plan,
          otherTopicAssessment: { verdict: "feasible", label: "Extra", reasonCode: null },
        })),
        "portuguese",
      ),
    ).toEqual(["plan_output_invalid"]);
  });

  it("plan_slot_mismatch: vaga fora de ordem, objetivo fora dos assuntos, exemplo fora de e1 e e2", () => {
    expect(
      codesOf(
        mathPlan((plan) => {
          const [first, second, ...rest] = plan.slotDetailList;
          if (first === undefined || second === undefined) throw new Error("fixture");
          return {
            ...plan,
            slotDetailList: [
              { ...second, questionType: first.questionType },
              { ...first, questionType: second.questionType },
              ...rest,
            ],
          };
        }),
        "math",
      ),
    ).toEqual(["plan_slot_mismatch"]);
    expect(
      codesOf(
        mathPlan((plan) => ({
          ...plan,
          topicObjectiveList: [...plan.topicObjectiveList].reverse(),
        })),
        "math",
      ),
    ).toEqual(["plan_slot_mismatch"]);
    expect(
      codesOf(
        mathPlan((plan) => ({
          ...plan,
          workedExampleFocusList: plan.workedExampleFocusList.map((focus) => ({
            ...focus,
            exampleId: "e1",
          })),
        })),
        "math",
      ),
    ).toEqual(["plan_slot_mismatch"]);
  });

  it("plan_multiple_choice_mix: 2 e 8 múltiplas escolhas num bloco", () => {
    const withMultipleChoiceCount = (count: number) =>
      mathPlan((plan) =>
        withSlotDetail(plan, (detail, index) =>
          index < 10
            ? { ...detail, questionType: index < count ? "multiple_choice" : "open_answer" }
            : detail,
        ),
      );
    expect(codesOf(withMultipleChoiceCount(2), "math")).toEqual(["plan_multiple_choice_mix"]);
    expect(codesOf(withMultipleChoiceCount(8), "math")).toEqual(["plan_multiple_choice_mix"]);
    expect(codesOf(withMultipleChoiceCount(3), "math")).toEqual([]);
    expect(codesOf(withMultipleChoiceCount(7), "math")).toEqual([]);
  });

  it("plan_contextualized_minority: 5 contextualizadas no simulado de Matemática", () => {
    const withContextualizedMockCount = (count: number) =>
      mathPlan((plan) =>
        withSlotDetail(plan, (detail, index) =>
          index >= 10 ? { ...detail, isContextualized: index - 10 < count } : detail,
        ),
      );
    expect(codesOf(withContextualizedMockCount(5), "math")).toEqual([
      "plan_contextualized_minority",
    ]);
    expect(codesOf(withContextualizedMockCount(6), "math")).toEqual([]);
    expect(
      codesOf(
        portuguesePlan((plan) =>
          withSlotDetail(plan, (detail) => ({ ...detail, isContextualized: false })),
        ),
        "portuguese",
      ),
    ).toEqual([]);
  });

  it("plan_base_text_invalid: quantidade, vaga sem texto, bloco errado, texto inexistente e Matemática", () => {
    const invalidPlanList: readonly KitPlan[] = [
      portuguesePlan((plan) => ({
        ...withSlotDetail(plan, (detail, index) =>
          index >= 10 ? { ...detail, baseTextId: "t3" } : { ...detail, baseTextId: null },
        ),
        baseTextBriefList: plan.baseTextBriefList.map((brief) => ({ ...brief, block: "practice" })),
      })),
      portuguesePlan((plan) => ({
        ...plan,
        baseTextBriefList: plan.baseTextBriefList.map((brief) => ({ ...brief, block: "mock" })),
      })),
      portuguesePlan((plan) =>
        withSlotDetail(plan, (detail, index) =>
          index === 19 ? { ...detail, baseTextId: null } : detail,
        ),
      ),
      portuguesePlan((plan) => ({
        ...plan,
        baseTextBriefList: plan.baseTextBriefList.map((brief) =>
          brief.baseTextId === "t2" ? { ...brief, block: "practice" } : brief,
        ),
      })),
      portuguesePlan((plan) =>
        withSlotDetail(plan, (detail, index) =>
          index === 4 ? { ...detail, baseTextId: "t1" } : detail,
        ),
      ),
      portuguesePlan((plan) => ({
        ...plan,
        baseTextBriefList: plan.baseTextBriefList.filter((brief) => brief.baseTextId !== "t3"),
      })),
    ];
    for (const plan of invalidPlanList) {
      expect(codesOf(plan, "portuguese")).toEqual(["plan_base_text_invalid"]);
    }
    expect(
      codesOf(
        mathPlan((plan) => ({
          ...plan,
          baseTextBriefList: [
            { baseTextId: "t1", block: "mock", genre: "conto", theme: "a feira" },
          ],
        })),
        "math",
      ),
    ).toEqual(["plan_base_text_invalid"]);
    expect(
      codesOf(
        mathPlan((plan) =>
          withSlotDetail(plan, (detail, index) =>
            index === 0 ? { ...detail, baseTextId: "t1" } : detail,
          ),
        ),
        "math",
      ),
    ).toEqual(["plan_base_text_invalid"]);
  });

  it("other_topic_unfeasible: outro inviável não regenera", () => {
    const result = validateKitPlan(
      mathPlan((plan) => ({
        ...plan,
        otherTopicAssessment: { verdict: "unfeasible", label: "Mapas", reasonCode: "figure" },
      })),
      mathSlotPlan,
      "math",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual([
        {
          code: "other_topic_unfeasible",
          severity: "blocker",
          stage: "plan",
          itemId: "other",
          note: null,
          excerpt: null,
        },
      ]);
    }
  });
});

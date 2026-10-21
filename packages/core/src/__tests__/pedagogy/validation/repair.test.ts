import { describe, expect, it } from "bun:test";
import {
  buildMathFixture,
  buildPortugueseFixture,
} from "#src/__tests__/__fixtures__/kit-content.ts";
import { practiceQuestionIdList } from "#src/pedagogy/kit-item.ts";
import { createValidationIssue } from "#src/pedagogy/validation/issue.ts";
import { decideRepair, generationFailReasonCodeList } from "#src/pedagogy/validation/repair.ts";

const math = buildMathFixture();
const portuguese = buildPortugueseFixture();

describe("generationFailReasonCodeList (jobs.md §4)", () => {
  it("lista os fail_reason_code da geração, inclusive os do decideRepair", () => {
    expect(generationFailReasonCodeList).toEqual([
      "ai_output_invalid",
      "generation_blocked",
      "other_topic_unfeasible",
      "ai_cost_exceeded",
      "render_failed",
    ]);
  });
});

describe("decideRepair (spec pedagógica §8 e §10)", () => {
  it("sem bloqueador não regenera; aviso e render não contam", () => {
    expect(decideRepair([], math.studyKit)).toBeNull();
    expect(
      decideRepair(
        [
          createValidationIssue("unit_missing", { itemId: "p6" }),
          createValidationIssue("review_weak_distractor", { itemId: "m1" }),
          createValidationIssue("render_failed"),
          createValidationIssue("page_count_out_of_range"),
        ],
        math.studyKit,
      ),
    ).toBeNull();
  });

  it("none vence todos e escolhe o fail_reason_code", () => {
    expect(
      decideRepair(
        [
          createValidationIssue("other_topic_unfeasible", { itemId: "other" }),
          createValidationIssue("plan_slot_mismatch"),
        ],
        null,
      ),
    ).toEqual({ repair: "none", failReasonCode: "other_topic_unfeasible" });
    expect(
      decideRepair(
        [
          createValidationIssue("topic_coverage_below_minimum", { itemId: "other" }),
          createValidationIssue("kit_output_invalid"),
          createValidationIssue("figure_reference", { itemId: "p1" }),
        ],
        math.studyKit,
      ),
    ).toEqual({ repair: "none", failReasonCode: "generation_blocked" });
  });

  it("plan vence kit e item", () => {
    expect(
      decideRepair(
        [
          createValidationIssue("plan_multiple_choice_mix"),
          createValidationIssue("review_kit_off_topic"),
          createValidationIssue("figure_reference", { itemId: "p1" }),
        ],
        math.studyKit,
      ),
    ).toEqual({ repair: "plan" });
  });

  it("kit vence item", () => {
    expect(
      decideRepair(
        [
          createValidationIssue("review_kit_personal_data"),
          createValidationIssue("figure_reference", { itemId: "p1" }),
        ],
        math.studyKit,
      ),
    ).toEqual({ repair: "kit" });
  });

  it("item refaz só os itens marcados, na ordem do kit", () => {
    const issueList = [
      createValidationIssue("review_answer_incorrect", { itemId: "m3", note: "conta errada" }),
      createValidationIssue("figure_reference", { itemId: "p2", excerpt: "Observe a figura" }),
      createValidationIssue("review_kit_section_incorrect", { itemId: "ma5-fractions" }),
      createValidationIssue("unit_missing", { itemId: "p6" }),
    ];
    expect(decideRepair(issueList, math.studyKit)).toEqual({
      repair: "item",
      itemIdList: ["ma5-fractions", "p2", "m3"],
      issueList: issueList.slice(0, 3),
    });
  });

  it("texto-base marcado leva junto as questões que o citam", () => {
    const decision = decideRepair(
      [createValidationIssue("review_kit_base_text_inappropriate", { itemId: "t3" })],
      portuguese.studyKit,
    );
    expect(decision).toMatchObject({ repair: "item", itemIdList: ["t3", "p1", "p2", "p3"] });
  });

  it("mais de MAX_REPAIR_ITEM_COUNT itens vira kit", () => {
    const issueList = practiceQuestionIdList
      .slice(0, 9)
      .map((itemId) => createValidationIssue("review_off_topic", { itemId }));
    expect(decideRepair(issueList.slice(0, 8), math.studyKit)).toMatchObject({ repair: "item" });
    expect(decideRepair(issueList, math.studyKit)).toEqual({ repair: "kit" });
    expect(
      decideRepair(
        [createValidationIssue("review_kit_base_text_inappropriate", { itemId: "t1" })],
        portuguese.studyKit,
      ),
    ).toMatchObject({ repair: "item" });
    expect(
      decideRepair(
        [
          createValidationIssue("review_kit_base_text_inappropriate", { itemId: "t1" }),
          createValidationIssue("review_kit_base_text_inappropriate", { itemId: "t2" }),
        ],
        portuguese.studyKit,
      ),
    ).toEqual({ repair: "kit" });
  });

  it("bloqueador de item sem item (dica ou rótulo do outro) sobe para plan", () => {
    expect(
      decideRepair(
        [createValidationIssue("personal_data_pattern", { excerpt: "21 3456-7890" })],
        math.studyKit,
      ),
    ).toEqual({ repair: "plan" });
  });
});

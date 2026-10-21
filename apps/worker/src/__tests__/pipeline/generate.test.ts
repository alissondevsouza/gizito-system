import { describe, expect, it } from "bun:test";
import {
  fullReviewItemIdList,
  MAX_REPAIR_ITEM_COUNT,
  type StudyKit,
  type Subject,
  studyKitSchema,
} from "@gizito/core";
import type { createFakeAiProvider } from "@gizito/integrations/fakes";
import {
  createFixtureAiProvider,
  dependenciesOf,
  fixtureOf,
  OTHER_TOPIC_TEXT,
  repairItemIdListOf,
  requestOf,
  reviewedItemIdListOf,
  reviewWithIssueOf,
  stageListOf,
} from "#src/__tests__/pipeline/__fixtures__/generation.ts";
import type { AiCallRecord } from "#src/pipeline/ai-call.ts";
import { GENERATION_VERSION, generateKit } from "#src/pipeline/generate.ts";

function withoutQualityCheck(studyKit: StudyKit) {
  return { ...studyKit, qualityCheckList: [] };
}

function codeListOf(issueList: readonly { readonly code: string }[]): readonly string[] {
  return issueList.map((issue) => issue.code);
}

function reviewRequestList(aiProvider: ReturnType<typeof createFakeAiProvider>) {
  return aiProvider.requestList.filter((record) => record.stage === "review");
}

describe("generateKit sem bloqueador (spec F1-07, RF-03)", () => {
  it.each<Subject>(["math", "portuguese"])(
    "kit de %s sai com plan, generate e review, sem imagem",
    async (subject) => {
      const fixture = fixtureOf(subject);
      const aiProvider = createFixtureAiProvider(fixture);
      const result = await generateKit(requestOf(subject), dependenciesOf(aiProvider, fixture));
      if (!result.ok) throw new Error(`falhou com ${result.error.code}`);
      const { studyKit, attemptList, aiCallList } = result.value;
      expect(studyKitSchema.safeParse(studyKit).success).toBe(true);
      expect(studyKit).toEqual({
        ...withoutQualityCheck(fixture.studyKit),
        generationVersion: GENERATION_VERSION,
      });
      expect(studyKit.generationVersion).toBe("extract-v1+plan-v1+generate-v2+review-v2");
      expect(GENERATION_VERSION).toBe(studyKit.generationVersion);
      expect(attemptList).toEqual([{ repair: "initial", issueList: [] }]);
      expect(aiCallList.map((call) => [call.stage, call.promptVersion, call.outcomeCode])).toEqual([
        ["plan", "plan-v1", "ok"],
        ["generate", "generate-v2", "ok"],
        ["review", "review-v2", "ok"],
      ]);
      expect(aiProvider.requestList.every((record) => record.request.imageList === undefined)).toBe(
        true,
      );
      const [review] = reviewRequestList(aiProvider);
      if (review === undefined) throw new Error("sem revisão");
      expect(reviewedItemIdListOf(review.request)).toEqual(fullReviewItemIdList);
    },
  );

  it("avisos da validação e da revisão vão para qualityCheckList", async () => {
    const fixture = fixtureOf("math");
    const aiProvider = createFixtureAiProvider(fixture);
    aiProvider.enqueueOutput(
      "review",
      reviewWithIssueOf(fixture.studyKit, [{ itemId: "m1", code: "weak_distractor" }]),
    );
    const result = await generateKit(requestOf("math"), dependenciesOf(aiProvider, fixture));
    if (!result.ok) throw new Error(`falhou com ${result.error.code}`);
    expect(result.value.studyKit.qualityCheckList).toEqual([
      expect.objectContaining({
        code: "review_weak_distractor",
        itemId: "m1",
        severity: "warning",
      }),
    ]);
    expect(stageListOf(aiProvider)).toEqual(["plan", "generate", "review"]);
  });

  it("o plano recebe o outro e a observação como dado, e o generate e o review o rótulo do plano", async () => {
    const fixture = fixtureOf("math");
    const aiProvider = createFixtureAiProvider(fixture);
    await generateKit(
      { ...requestOf("math"), noteText: "Ele troca <b>numerador</b>" },
      dependenciesOf(aiProvider, fixture),
    );
    const [plan, generate, review] = aiProvider.requestList.map(
      (record) => record.request.userText,
    );
    expect(plan).toContain(OTHER_TOPIC_TEXT);
    expect(plan).toContain("Ele troca bnumerador/b");
    expect(plan).toContain("other | ver <assunto_outro>");
    expect(generate).toContain(`other | ${fixture.plan.otherTopicAssessment?.label}`);
    expect(review).toContain(`other | ${fixture.plan.otherTopicAssessment?.label}`);
    expect(generate).not.toContain(OTHER_TOPIC_TEXT);
    expect(review).not.toContain(OTHER_TOPIC_TEXT);
  });

  it("pedido fora do contrato é erro de programação, sem chamada", async () => {
    const fixture = fixtureOf("math");
    const aiProvider = createFixtureAiProvider(fixture);
    const dependencies = dependenciesOf(aiProvider, fixture);
    const request = requestOf("math");
    await expect(
      generateKit({ ...request, topicRefList: ["other", "ma5-fractions"] }, dependencies),
    ).rejects.toThrow(RangeError);
    await expect(generateKit({ ...request, otherTopicText: null }, dependencies)).rejects.toThrow(
      RangeError,
    );
    await expect(
      generateKit(
        { ...request, topicRefList: ["ma4-place-value"], otherTopicText: null },
        dependencies,
      ),
    ).rejects.toThrow(RangeError);
    await expect(generateKit({ ...request, topicRefList: [] }, dependencies)).rejects.toThrow(
      RangeError,
    );
    expect(aiProvider.requestList).toEqual([]);
  });
});

describe("generateKit regenera pelo código mais forte (spec F1-07, RF-04)", () => {
  it("plano fora do schema refaz o plano e o kit sai na segunda", async () => {
    const fixture = fixtureOf("math");
    const aiProvider = createFixtureAiProvider(fixture);
    aiProvider.enqueueFailure("plan", "ai_output_invalid");
    const result = await generateKit(requestOf("math"), dependenciesOf(aiProvider, fixture));
    if (!result.ok) throw new Error(`falhou com ${result.error.code}`);
    expect(
      result.value.attemptList.map((attempt) => [attempt.repair, codeListOf(attempt.issueList)]),
    ).toEqual([
      ["initial", ["plan_output_invalid"]],
      ["plan", []],
    ]);
    expect(stageListOf(aiProvider)).toEqual(["plan", "plan", "generate", "review"]);
  });

  it("kit truncado refaz o generate com o mesmo plano", async () => {
    const fixture = fixtureOf("portuguese");
    const aiProvider = createFixtureAiProvider(fixture);
    aiProvider.enqueueFailure("generate", "ai_output_truncated");
    const result = await generateKit(requestOf("portuguese"), dependenciesOf(aiProvider, fixture));
    if (!result.ok) throw new Error(`falhou com ${result.error.code}`);
    expect(result.value.attemptList.map((attempt) => attempt.repair)).toEqual(["initial", "kit"]);
    expect(stageListOf(aiProvider)).toEqual(["plan", "generate", "generate", "review"]);
  });

  it("reparo por item vindo da revisão manda só o item e revisa só ele, mantendo os avisos dos outros", async () => {
    const fixture = fixtureOf("math");
    const aiProvider = createFixtureAiProvider(fixture);
    aiProvider.enqueueOutput(
      "review",
      reviewWithIssueOf(fixture.studyKit, [
        { itemId: "p3", code: "answer_incorrect" },
        { itemId: "m2", code: "unclear_wording" },
      ]),
    );
    const result = await generateKit(requestOf("math"), dependenciesOf(aiProvider, fixture));
    if (!result.ok) throw new Error(`falhou com ${result.error.code}`);
    expect(stageListOf(aiProvider)).toEqual(["plan", "generate", "review", "generate", "review"]);
    const repairRequest = aiProvider.requestList[3]?.request;
    if (repairRequest === undefined) throw new Error("sem pedido de reparo");
    expect(repairItemIdListOf(repairRequest)).toEqual(["p3"]);
    expect(repairRequest.userText).toContain("- p3: review_answer_incorrect — ");
    expect(repairRequest.userText).toContain("revisão: nota da revisão sobre o item");
    expect(repairRequest.userText).toContain("<kit_atual>");
    const [, secondReview] = reviewRequestList(aiProvider);
    if (secondReview === undefined) throw new Error("sem segunda revisão");
    expect(reviewedItemIdListOf(secondReview.request)).toEqual(["p3"]);
    expect(result.value.attemptList.map((attempt) => attempt.repair)).toEqual(["initial", "item"]);
    expect(result.value.studyKit.qualityCheckList).toEqual([
      expect.objectContaining({ code: "review_unclear_wording", itemId: "m2" }),
    ]);
    expect(result.value.aiCallList).toHaveLength(5);
  });

  it("reparo por item vindo da validação termina com revisão completa", async () => {
    const fixture = fixtureOf("math");
    const aiProvider = createFixtureAiProvider(fixture);
    aiProvider.enqueueOutput("generate", {
      ...fixture.content,
      practiceQuestionList: fixture.content.practiceQuestionList.map((question) =>
        question.questionId === "p2"
          ? {
              ...question,
              answer: {
                ...question.answer,
                expectedAnswer: { kind: "number", value: 999, unit: null, tolerance: 0 },
              },
            }
          : question,
      ),
    });
    const result = await generateKit(requestOf("math"), dependenciesOf(aiProvider, fixture));
    if (!result.ok) throw new Error(`falhou com ${result.error.code}`);
    expect(codeListOf(result.value.attemptList[0]?.issueList ?? [])).toEqual([
      "math_recalculation_mismatch",
    ]);
    expect(stageListOf(aiProvider)).toEqual(["plan", "generate", "generate", "review"]);
    const [review] = reviewRequestList(aiProvider);
    if (review === undefined) throw new Error("sem revisão");
    expect(reviewedItemIdListOf(review.request)).toEqual(fullReviewItemIdList);
  });

  it("aviso do kit marcado de novo na revisão parcial sai uma vez só", async () => {
    const fixture = fixtureOf("math");
    const aiProvider = createFixtureAiProvider(fixture);
    const styleIssue = {
      code: "style_mismatch" as const,
      targetId: null,
      note: "o kit destoa do caderno",
    };
    const firstReview = reviewWithIssueOf(
      fixture.studyKit,
      [{ itemId: "p3", code: "answer_incorrect" }],
      [styleIssue],
    );
    aiProvider.enqueueOutput("review", firstReview);
    aiProvider.enqueueOutput("review", {
      itemReviewList: reviewWithIssueOf(fixture.studyKit, []).itemReviewList.filter(
        (review) => review.itemId === "p3",
      ),
      kitIssueList: [styleIssue],
    });
    const result = await generateKit(requestOf("math"), dependenciesOf(aiProvider, fixture));
    if (!result.ok) throw new Error(`falhou com ${result.error.code}`);
    expect(codeListOf(result.value.studyKit.qualityCheckList)).toEqual([
      "review_kit_style_mismatch",
    ]);
  });

  it("texto-base marcado leva junto as questões que o citam, no reparo e na revisão", async () => {
    const fixture = fixtureOf("portuguese");
    const aiProvider = createFixtureAiProvider(fixture);
    aiProvider.enqueueOutput(
      "review",
      reviewWithIssueOf(
        fixture.studyKit,
        [],
        [{ code: "base_text_inappropriate", targetId: "t1", note: "texto-base acima do ano" }],
      ),
    );
    const result = await generateKit(requestOf("portuguese"), dependenciesOf(aiProvider, fixture));
    if (!result.ok) throw new Error(`falhou com ${result.error.code}`);
    const repairRequest = aiProvider.requestList[3]?.request;
    if (repairRequest === undefined) throw new Error("sem pedido de reparo");
    const citingIdList = fixture.studyKit.mockQuestionList
      .filter((question) => question.baseTextId === "t1")
      .map((question) => question.questionId);
    expect(repairItemIdListOf(repairRequest)).toEqual(["t1", ...citingIdList]);
    expect(repairRequest.userText).toContain(
      `- ${citingIdList[0]}: acompanha o texto-base t1, que será refeito`,
    );
    const [, secondReview] = reviewRequestList(aiProvider);
    if (secondReview === undefined) throw new Error("sem segunda revisão");
    expect(reviewedItemIdListOf(secondReview.request)).toEqual(citingIdList);
    expect(secondReview.request.userText).toContain('"baseTextId":"t1"');
    expect(secondReview.request.userText).not.toContain('"baseTextId":"t2","title"');
  });

  it(`mais de ${MAX_REPAIR_ITEM_COUNT} itens marcados refaz o kit inteiro`, async () => {
    const fixture = fixtureOf("math");
    const aiProvider = createFixtureAiProvider(fixture);
    const flagged = fullReviewItemIdList
      .slice(0, MAX_REPAIR_ITEM_COUNT + 1)
      .map((itemId) => ({ itemId, code: "answer_ambiguous" as const }));
    aiProvider.enqueueOutput("review", reviewWithIssueOf(fixture.studyKit, flagged));
    const result = await generateKit(requestOf("math"), dependenciesOf(aiProvider, fixture));
    if (!result.ok) throw new Error(`falhou com ${result.error.code}`);
    expect(result.value.attemptList.map((attempt) => attempt.repair)).toEqual(["initial", "kit"]);
    expect(stageListOf(aiProvider)).toEqual(["plan", "generate", "review", "generate", "review"]);
    const [, secondReview] = reviewRequestList(aiProvider);
    if (secondReview === undefined) throw new Error("sem segunda revisão");
    expect(reviewedItemIdListOf(secondReview.request)).toEqual(fullReviewItemIdList);
  });

  it("bloqueador também depois da regeneração falha com generation_blocked", async () => {
    const fixture = fixtureOf("math");
    const aiProvider = createFixtureAiProvider(fixture);
    const flaggedReview = reviewWithIssueOf(fixture.studyKit, [
      { itemId: "p1", code: "off_topic" },
    ]);
    aiProvider.enqueueOutput("review", flaggedReview);
    aiProvider.enqueueOutput("review", {
      ...flaggedReview,
      itemReviewList: flaggedReview.itemReviewList.filter((review) => review.itemId === "p1"),
    });
    const result = await generateKit(requestOf("math"), dependenciesOf(aiProvider, fixture));
    if (result.ok) throw new Error("deveria falhar");
    expect(result.error.code).toBe("generation_blocked");
    expect(result.error.isRetryable).toBe(false);
    expect(result.error.attemptList.map((attempt) => attempt.repair)).toEqual(["initial", "item"]);
    expect(result.error.lastStudyKit?.practiceQuestionList[0]?.questionId).toBe("p1");
  });

  it("saída inválida também depois da regeneração falha com ai_output_invalid", async () => {
    const fixture = fixtureOf("math");
    const aiProvider = createFixtureAiProvider(fixture);
    aiProvider.enqueueFailure("generate", "ai_output_invalid");
    aiProvider.enqueueFailure("generate", "ai_refused");
    const result = await generateKit(requestOf("math"), dependenciesOf(aiProvider, fixture));
    if (result.ok) throw new Error("deveria falhar");
    expect(result.error.code).toBe("ai_output_invalid");
    expect(stageListOf(aiProvider)).toEqual(["plan", "generate", "generate"]);
  });

  it("outro inviável falha sem regenerar, também na segunda tentativa", async () => {
    const fixture = fixtureOf("math");
    const unfeasiblePlan = {
      ...fixture.plan,
      otherTopicAssessment: { verdict: "unfeasible", label: "Desenho livre", reasonCode: "figure" },
    };
    const aiProvider = createFixtureAiProvider(fixture);
    aiProvider.enqueueOutput("plan", unfeasiblePlan);
    const first = await generateKit(requestOf("math"), dependenciesOf(aiProvider, fixture));
    if (first.ok) throw new Error("deveria falhar");
    expect([first.error.code, first.error.aiCallList.length]).toEqual([
      "other_topic_unfeasible",
      1,
    ]);

    const retried = createFixtureAiProvider(fixture);
    retried.enqueueFailure("plan", "ai_output_invalid");
    retried.enqueueOutput("plan", unfeasiblePlan);
    const second = await generateKit(requestOf("math"), dependenciesOf(retried, fixture));
    if (second.ok) throw new Error("deveria falhar");
    expect([second.error.code, second.error.aiCallList.length]).toEqual([
      "other_topic_unfeasible",
      2,
    ]);
  });
});

describe("generateKit com revisão inválida (spec F1-07, RF-05)", () => {
  it("a nova chamada vale também na revisão depois do reparo por item", async () => {
    const fixture = fixtureOf("math");
    const aiProvider = createFixtureAiProvider(fixture);
    aiProvider.enqueueOutput(
      "review",
      reviewWithIssueOf(fixture.studyKit, [{ itemId: "p3", code: "answer_incorrect" }]),
    );
    aiProvider.enqueueFailure("review", "ai_output_invalid");
    const result = await generateKit(requestOf("math"), dependenciesOf(aiProvider, fixture));
    if (!result.ok) throw new Error(`falhou com ${result.error.code}`);
    expect(stageListOf(aiProvider)).toEqual([
      "plan",
      "generate",
      "review",
      "generate",
      "review",
      "review",
    ]);
    expect(result.value.attemptList.map((attempt) => attempt.repair)).toEqual(["initial", "item"]);
  });

  it("uma nova chamada de revisão não gasta a regeneração", async () => {
    const fixture = fixtureOf("math");
    const aiProvider = createFixtureAiProvider(fixture);
    aiProvider.enqueueFailure("review", "ai_output_invalid");
    const result = await generateKit(requestOf("math"), dependenciesOf(aiProvider, fixture));
    if (!result.ok) throw new Error(`falhou com ${result.error.code}`);
    expect(stageListOf(aiProvider)).toEqual(["plan", "generate", "review", "review"]);
    expect(result.value.attemptList.map((attempt) => attempt.repair)).toEqual(["initial"]);
  });

  it("letra inválida e ids trocados também ganham a nova chamada", async () => {
    const fixture = fixtureOf("math");
    const aiProvider = createFixtureAiProvider(fixture);
    const output = reviewWithIssueOf(fixture.studyKit, []);
    aiProvider.enqueueOutput("review", {
      ...output,
      itemReviewList: output.itemReviewList.map((item, index) =>
        index === 0 ? { ...item, independentAnswer: "Z" } : item,
      ),
    });
    aiProvider.enqueueOutput("review", {
      ...output,
      itemReviewList: output.itemReviewList.slice(1),
    });
    const result = await generateKit(requestOf("math"), dependenciesOf(aiProvider, fixture));
    if (result.ok) throw new Error("deveria falhar");
    expect(result.error.code).toBe("ai_output_invalid");
    expect(result.error.isRetryable).toBe(false);
    expect(stageListOf(aiProvider)).toEqual(["plan", "generate", "review", "review"]);
  });
});

describe("generateKit interrompido (spec F1-07, RF-06)", () => {
  it("sinal abortado antes de começar não faz chamada", async () => {
    const fixture = fixtureOf("math");
    const aiProvider = createFixtureAiProvider(fixture);
    const controller = new AbortController();
    controller.abort();
    const result = await generateKit(
      requestOf("math"),
      dependenciesOf(aiProvider, fixture, { signal: controller.signal }),
    );
    if (result.ok) throw new Error("deveria falhar");
    expect([result.error.code, result.error.isRetryable]).toEqual(["ai_aborted", true]);
    expect(aiProvider.requestList).toEqual([]);
  });

  it("o sinal vai em toda requisição ao provedor", async () => {
    const fixture = fixtureOf("math");
    const aiProvider = createFixtureAiProvider(fixture);
    const controller = new AbortController();
    aiProvider.enqueueOutput(
      "review",
      reviewWithIssueOf(fixture.studyKit, [{ itemId: "p3", code: "answer_incorrect" }]),
    );
    const result = await generateKit(
      requestOf("math"),
      dependenciesOf(aiProvider, fixture, { signal: controller.signal }),
    );
    expect(result.ok).toBe(true);
    expect(aiProvider.requestList).toHaveLength(5);
    expect(
      aiProvider.requestList.every((record) => record.request.signal === controller.signal),
    ).toBe(true);
  });

  it("sinal abortado depois do plano para antes do generate", async () => {
    const fixture = fixtureOf("math");
    const aiProvider = createFixtureAiProvider(fixture);
    const controller = new AbortController();
    const result = await generateKit(
      requestOf("math"),
      dependenciesOf(aiProvider, fixture, {
        signal: controller.signal,
        onAiCall: () => controller.abort(),
      }),
    );
    if (result.ok) throw new Error("deveria falhar");
    expect([result.error.code, result.error.isRetryable]).toEqual(["ai_aborted", true]);
    expect(stageListOf(aiProvider)).toEqual(["plan"]);
    expect(result.error.aiCallList).toHaveLength(1);
  });
});

describe("generateKit com falha que não é do kit (spec F1-07, RF-07)", () => {
  it("limite de taxa no generate é retryable e leva as chamadas feitas", async () => {
    const fixture = fixtureOf("math");
    const aiProvider = createFixtureAiProvider(fixture);
    aiProvider.enqueueFailure("generate", "ai_rate_limited");
    const result = await generateKit(requestOf("math"), dependenciesOf(aiProvider, fixture));
    if (result.ok) throw new Error("deveria falhar");
    expect([result.error.code, result.error.isRetryable]).toEqual(["ai_rate_limited", true]);
    expect(result.error.aiCallList.map((call) => call.outcomeCode)).toEqual([
      "ok",
      "ai_rate_limited",
    ]);
  });

  it("falha da conta no plano não é retryable e não gasta a regeneração", async () => {
    const fixture = fixtureOf("math");
    const aiProvider = createFixtureAiProvider(fixture);
    aiProvider.enqueueFailure("plan", "ai_auth_failed");
    const result = await generateKit(requestOf("math"), dependenciesOf(aiProvider, fixture));
    if (result.ok) throw new Error("deveria falhar");
    expect([result.error.code, result.error.isRetryable]).toEqual(["ai_auth_failed", false]);
    expect(result.error.attemptList).toEqual([]);
    expect(result.error.lastStudyKit).toBeNull();
  });
});

describe("generateKit com teto de custo (spec F1-07, RF-08)", () => {
  it("custo do pedido no teto falha sem chamada nenhuma", async () => {
    const fixture = fixtureOf("math");
    const aiProvider = createFixtureAiProvider(fixture);
    const result = await generateKit(
      requestOf("math"),
      dependenciesOf(aiProvider, fixture, { spentCostCents: 50, maxCostCents: 50 }),
    );
    if (result.ok) throw new Error("deveria falhar");
    expect([result.error.code, result.error.isRetryable]).toEqual(["ai_cost_exceeded", false]);
    expect(aiProvider.requestList).toEqual([]);
  });

  it("a chamada que passaria do teto não acontece e a falha leva as anteriores", async () => {
    const fixture = fixtureOf("math");
    const aiProvider = createFixtureAiProvider(fixture);
    const result = await generateKit(
      requestOf("math"),
      dependenciesOf(aiProvider, fixture, { maxCostCents: 0.0001 }),
    );
    if (result.ok) throw new Error("deveria falhar");
    expect(result.error.code).toBe("ai_cost_exceeded");
    expect(stageListOf(aiProvider)).toEqual(["plan"]);
    expect(result.error.aiCallList).toHaveLength(1);
  });
});

describe("generateKit registra cada chamada (spec F1-07, RF-09)", () => {
  it("onAiCall recebe os mesmos registros devolvidos", async () => {
    const fixture = fixtureOf("portuguese");
    const aiProvider = createFixtureAiProvider(fixture);
    const recordedList: AiCallRecord[] = [];
    const result = await generateKit(
      requestOf("portuguese"),
      dependenciesOf(aiProvider, fixture, {
        onAiCall: async (record) => {
          recordedList.push(record);
        },
      }),
    );
    if (!result.ok) throw new Error(`falhou com ${result.error.code}`);
    expect(recordedList).toEqual([...result.value.aiCallList]);
    expect(recordedList.every((record) => record.costCents > 0 && record.inputTokenCount > 0)).toBe(
      true,
    );
  });
});

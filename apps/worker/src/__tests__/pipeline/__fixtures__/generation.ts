import {
  type AiRequest,
  fullReviewItemIdList,
  type MaterialProfile,
  type ReviewedItemId,
  type ReviewResult,
  reviewedItemIdSchema,
  type StudyKit,
  type Subject,
  type TopicRef,
} from "@gizito/core";
import {
  buildMathFixture,
  buildPortugueseFixture,
  FIXTURE_MATERIAL_PROFILE,
  MATH_TOPIC_REF_LIST,
  type MathFixture,
  PORTUGUESE_TOPIC_REF_LIST,
  type PortugueseFixture,
} from "@gizito/core/testing";
import { isKatexParsable } from "@gizito/integrations";
import { createFakeAiProvider, type FakeAiProvider } from "@gizito/integrations/fakes";
import { z } from "zod";
import type { GenerationDependencies, GenerationRequest } from "#src/pipeline/generate.ts";

export const OTHER_TOPIC_TEXT = "problemas com dinheiro e troco";

export type KitFixture = MathFixture | PortugueseFixture;

export function fixtureOf(subject: Subject): KitFixture {
  return subject === "math" ? buildMathFixture() : buildPortugueseFixture();
}

export function requestOf(
  subject: Subject,
  materialProfile: MaterialProfile = FIXTURE_MATERIAL_PROFILE,
): GenerationRequest {
  const topicRefList: readonly TopicRef[] =
    subject === "math" ? MATH_TOPIC_REF_LIST : PORTUGUESE_TOPIC_REF_LIST;
  return {
    grade: "5",
    subject,
    topicRefList,
    perceivedDifficulty: null,
    noteText: null,
    otherTopicText: topicRefList.includes("other") ? OTHER_TOPIC_TEXT : null,
    materialProfile,
    sourceWarningCodeList: [],
  };
}

export function dependenciesOf(
  aiProvider: FakeAiProvider,
  fixture: KitFixture,
  override: Partial<GenerationDependencies> = {},
): GenerationDependencies {
  return {
    aiProvider,
    mathEvaluator: fixture.mathEvaluator,
    isMathMarkupParsable: isKatexParsable,
    spentCostCents: 0,
    ...override,
  };
}

function blockOf(userText: string, tag: string): string | null {
  return userText.split(`<${tag}>\n`)[1]?.split(`\n</${tag}>`)[0] ?? null;
}

export function repairItemIdListOf(request: AiRequest<unknown>): readonly string[] {
  const block = blockOf(request.userText, "itens_para_refazer") ?? "";
  return [...new Set([...block.matchAll(/^- ([a-z0-9-]+):/gm)].map((match) => match[1] ?? ""))];
}

const questionSheetSchema = z.object({
  itemList: z.array(z.object({ itemId: reviewedItemIdSchema })),
});

export function reviewedItemIdListOf(request: AiRequest<unknown>): readonly ReviewedItemId[] {
  const sheet = questionSheetSchema.parse(
    JSON.parse(blockOf(request.userText, "folha_de_questoes") ?? "{}"),
  );
  return sheet.itemList.map((item) => item.itemId);
}

export function isRepairRequest(request: AiRequest<unknown>): boolean {
  return request.userText.includes("<itens_para_refazer>");
}

export function repairOutputOf(fixture: KitFixture, itemIdList: readonly string[]) {
  const { content } = fixture;
  return {
    reviewSectionList: content.reviewSectionList.filter((section) =>
      itemIdList.includes(section.topicRef),
    ),
    workedExampleList: content.workedExampleList.filter((example) =>
      itemIdList.includes(example.exampleId),
    ),
    baseTextList: content.baseTextList.filter((baseText) =>
      itemIdList.includes(baseText.baseTextId),
    ),
    practiceQuestionList: content.practiceQuestionList.filter((question) =>
      itemIdList.includes(question.questionId),
    ),
    mockQuestionList: content.mockQuestionList.filter((question) =>
      itemIdList.includes(question.questionId),
    ),
  };
}

export function cleanReviewOf(
  studyKit: StudyKit,
  itemIdList: readonly ReviewedItemId[],
): ReviewResult {
  const questionList = [...studyKit.practiceQuestionList, ...studyKit.mockQuestionList];
  return {
    itemReviewList: itemIdList.map((itemId) => ({
      itemId,
      independentAnswer:
        questionList.find((question) => question.questionId === itemId)?.answer
          .correctOptionLabel ?? "resposta conferida",
      issueList: [],
    })),
    kitIssueList: [],
  };
}

export function respondWithFixture(aiProvider: FakeAiProvider, fixture: KitFixture): void {
  aiProvider.respondWith("plan", () => ({ kind: "output", output: fixture.plan }));
  aiProvider.respondWith("generate", (request) => ({
    kind: "output",
    output: isRepairRequest(request)
      ? repairOutputOf(fixture, repairItemIdListOf(request))
      : fixture.content,
  }));
  aiProvider.respondWith("review", (request) => ({
    kind: "output",
    output: cleanReviewOf(fixture.studyKit, reviewedItemIdListOf(request)),
  }));
}

export function createFixtureAiProvider(fixture: KitFixture): FakeAiProvider {
  const aiProvider = createFakeAiProvider();
  respondWithFixture(aiProvider, fixture);
  return aiProvider;
}

export type ReviewIssueInput = {
  readonly itemId: ReviewedItemId;
  readonly code: ReviewResult["itemReviewList"][number]["issueList"][number]["code"];
};

export function reviewWithIssueOf(
  studyKit: StudyKit,
  issueList: readonly ReviewIssueInput[],
  kitIssueList: ReviewResult["kitIssueList"] = [],
): ReviewResult {
  const clean = cleanReviewOf(studyKit, fullReviewItemIdList);
  return {
    itemReviewList: clean.itemReviewList.map((review) => ({
      ...review,
      issueList: issueList
        .filter((issue) => issue.itemId === review.itemId)
        .map((issue) => ({ code: issue.code, note: "nota da revisão sobre o item" })),
    })),
    kitIssueList,
  };
}

export function stageListOf(aiProvider: FakeAiProvider): readonly string[] {
  return aiProvider.requestList.map((record) => record.stage);
}

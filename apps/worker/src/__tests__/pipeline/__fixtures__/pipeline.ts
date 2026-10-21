import {
  ACTIVITIES_PAGE_RANGE,
  createValidationIssue,
  err,
  ok,
  type PhotoExtraction,
} from "@gizito/core";
import { FIXTURE_MATERIAL_PROFILE } from "@gizito/core/testing";
import { isKatexParsable } from "@gizito/integrations";
import type { FakeAiProvider } from "@gizito/integrations/fakes";
import {
  photoExtractionOf,
  syntheticImage,
  topicCandidateOf,
} from "#src/__tests__/pipeline/__fixtures__/extraction.ts";
import {
  createFixtureAiProvider,
  fixtureOf,
  OTHER_TOPIC_TEXT,
} from "#src/__tests__/pipeline/__fixtures__/generation.ts";
import type { PipelineDependencies, PipelineRequest } from "#src/pipeline/run-pipeline.ts";
import type { PdfRenderer } from "#src/render/pdf-renderer.ts";

export const pipelineFixture = fixtureOf("math");
export const FRACTIONS_TOPIC_ID = "ma5-fractions";
export const PERIMETER_TOPIC_ID = "ma5-perimeter-area";

const renderedPdf = ok({
  bytes: new TextEncoder().encode("%PDF-1.7"),
  pageCount: ACTIVITIES_PAGE_RANGE.min,
});

export function createCountingRenderer(failing = false) {
  const renderList: string[] = [];
  const pdfRenderer: PdfRenderer = {
    async render(document) {
      renderList.push(document.itemAttribute);
      return failing
        ? err({ issueList: [createValidationIssue("render_failed")], errorName: "RenderError" })
        : renderedPdf;
    },
    async close() {},
  };
  return { pdfRenderer, renderList };
}

export const twoTopicExtraction = photoExtractionOf({
  topicCandidateList: [topicCandidateOf(FRACTIONS_TOPIC_ID), topicCandidateOf(PERIMETER_TOPIC_ID)],
  materialProfile: FIXTURE_MATERIAL_PROFILE,
});

export function aiProviderWithExtraction(
  extraction: PhotoExtraction = twoTopicExtraction,
): FakeAiProvider {
  const aiProvider = createFixtureAiProvider(pipelineFixture);
  aiProvider.respondWith("extract", () => ({ kind: "output", output: extraction }));
  return aiProvider;
}

export async function pipelineRequestOf(
  override: Partial<PipelineRequest> = {},
): Promise<PipelineRequest> {
  return {
    grade: "5",
    subject: "math",
    photoList: [
      { image: await syntheticImage(10), insertDatetime: new Date() },
      { image: await syntheticImage(20), insertDatetime: new Date() },
    ],
    topicIdList: null,
    otherTopicText: OTHER_TOPIC_TEXT,
    perceivedDifficulty: null,
    noteText: null,
    ...override,
  };
}

export function pipelineDependenciesOf(
  aiProvider: FakeAiProvider,
  pdfRenderer: PdfRenderer,
  override: Partial<PipelineDependencies> = {},
): PipelineDependencies {
  return {
    aiProvider,
    extractModel: "claude-haiku-5-5",
    mathEvaluator: pipelineFixture.mathEvaluator,
    isMathMarkupParsable: isKatexParsable,
    pdfRenderer,
    now: () => new Date(),
    ...override,
  };
}

import { FIXTURE_MATERIAL_PROFILE } from "@gizito/core/testing";
import {
  photoExtractionOf,
  topicCandidateOf,
} from "#src/__tests__/pipeline/__fixtures__/extraction.ts";
import {
  aiProviderWithExtraction,
  createCountingRenderer,
  FRACTIONS_TOPIC_ID,
  PERIMETER_TOPIC_ID,
  pipelineDependenciesOf,
  pipelineRequestOf,
} from "#src/__tests__/pipeline/__fixtures__/pipeline.ts";
import { buildPipelineSummary } from "#src/cli/pipeline-report.ts";
import type { PipelineRequest } from "#src/pipeline/run-pipeline.ts";
import {
  type CaseRunOutcome,
  checkRegressionCase,
  EMPTY_CASE_TEXT_REFERENCE,
} from "#src/regression/case-check.ts";
import type { RegressionCase } from "#src/regression/regression-case.ts";
import type { CaseResult } from "#src/regression/regression-report.ts";
import { runRegressionCase } from "#src/regression/run-case.ts";

export const SENTINEL_EVIDENCE = "SENTINELA-EVIDENCIA do caderno";
export const SENTINEL_TERM = "SENTINELA-TERMO";
export const SENTINEL_NOTE = "SENTINELA-OBSERVACAO lenta";
export const SENTINEL_OTHER = "SENTINELA-OUTRO troco";
export const SENTINEL_CASE_NOTE = "SENTINELA-NOTA do caso";

export const FIXTURE_HASH = "a".repeat(64);

export function regressionCaseOf(override: Partial<RegressionCase> = {}): RegressionCase {
  return {
    caseId: "5-math-teste",
    grade: "5",
    subject: "math",
    photoList: [
      { fileName: "foto-1.png", sha256: FIXTURE_HASH, expectedLegibility: "good" },
      { fileName: "foto-2.png", sha256: FIXTURE_HASH, expectedLegibility: "good" },
    ],
    tagList: ["handwritten", "fractions"],
    expectedPreview: {
      outcome: "preview_ready",
      failCode: null,
      requiredTopicIdList: [FRACTIONS_TOPIC_ID],
      acceptableTopicIdList: [PERIMETER_TOPIC_ID],
      unsupportedTopicIdList: [],
      requiredSourceWarningCodeList: [],
    },
    confirmation: null,
    expectedKitOutcome: "ready",
    note: SENTINEL_CASE_NOTE,
    ...override,
  };
}

export const sentinelExtraction = photoExtractionOf({
  topicCandidateList: [
    topicCandidateOf(FRACTIONS_TOPIC_ID, { evidence: SENTINEL_EVIDENCE }),
    topicCandidateOf(PERIMETER_TOPIC_ID, { evidence: SENTINEL_EVIDENCE }),
  ],
  materialProfile: { ...FIXTURE_MATERIAL_PROFILE, terminologyList: [SENTINEL_TERM] },
});

export async function fixtureRunOf(
  extraction = sentinelExtraction,
  requestOverride: Partial<PipelineRequest> = {},
): Promise<{ readonly request: PipelineRequest; readonly outcome: CaseRunOutcome }> {
  const request = await pipelineRequestOf({
    otherTopicText: SENTINEL_OTHER,
    noteText: SENTINEL_NOTE,
    ...requestOverride,
  });
  const { pdfRenderer } = createCountingRenderer();
  const dependencies = pipelineDependenciesOf(aiProviderWithExtraction(extraction), pdfRenderer);
  return { request, outcome: await runRegressionCase(request, dependencies) };
}

export async function caseResultOf(
  regressionCase: RegressionCase = regressionCaseOf(),
  extraction = sentinelExtraction,
  requestOverride: Partial<PipelineRequest> = {},
): Promise<CaseResult> {
  const { request, outcome } = await fixtureRunOf(extraction, requestOverride);
  return {
    regressionCase,
    check: checkRegressionCase(regressionCase, outcome, EMPTY_CASE_TEXT_REFERENCE),
    summary: outcome.kind === "ran" ? buildPipelineSummary(outcome.run, request) : null,
    crash:
      outcome.kind === "crashed" ? { stage: outcome.stage, errorName: outcome.errorName } : null,
  };
}

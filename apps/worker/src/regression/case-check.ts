import type { MergedExtraction, PhotoExtraction } from "@gizito/core";
import type { PipelineRun, PipelineStage } from "#src/pipeline/run-pipeline.ts";
import type { ExpectedKitOutcome, RegressionCase } from "#src/regression/regression-case.ts";

export const caseCheckCodeList = [
  "preview_outcome_mismatch",
  "required_topic_missing",
  "unexpected_topic",
  "unsupported_topic_missed",
  "legibility_mismatch",
  "source_warning_missed",
  "personal_data_copied",
  "material_copied",
  "kit_outcome_mismatch",
] as const;
export type CaseCheckCode = (typeof caseCheckCodeList)[number];

export const criticalCaseCheckCodeList: readonly CaseCheckCode[] = [
  "preview_outcome_mismatch",
  "kit_outcome_mismatch",
];
export const extractionCaseCheckCodeList: readonly CaseCheckCode[] = [
  "required_topic_missing",
  "unexpected_topic",
  "unsupported_topic_missed",
];

export const UNEXPECTED_MEDIUM_TOPIC_WARNING = "unexpected_topic_medium";

export type ActualPreview = {
  readonly outcome: "preview_ready" | "analysis_failed" | "analysis_error";
  readonly failCode: string | null;
};

export type ActualKitOutcome = "ready" | "failed" | "not_applicable" | "crashed";

export type CaseRunOutcome =
  | {
      readonly kind: "ran";
      readonly run: PipelineRun;
      readonly photoExtractionList: readonly PhotoExtraction[];
    }
  | {
      readonly kind: "crashed";
      readonly stage: PipelineStage | null;
      readonly errorName: string;
    };

export type CaseTextReference = {
  readonly personalDataTextList: readonly string[];
  readonly materialPhraseList: readonly string[];
};

export const EMPTY_CASE_TEXT_REFERENCE: CaseTextReference = {
  personalDataTextList: [],
  materialPhraseList: [],
};

export type CaseCheck = {
  readonly failedCheckList: readonly CaseCheckCode[];
  readonly expectedKitOutcome: ExpectedKitOutcome;
  readonly warningList: readonly string[];
  readonly actualPreview: ActualPreview | null;
  readonly actualKitOutcome: ActualKitOutcome;
};

const emptyMergedExtraction: Pick<
  MergedExtraction,
  "photoList" | "topicCandidateList" | "unsupportedTopicList" | "sourceWarningList"
> = { photoList: [], topicCandidateList: [], unsupportedTopicList: [], sourceWarningList: [] };

const PHONE_DIGIT_SEPARATOR_PATTERN = /[\s().-]/g;

function actualPreviewOf(run: PipelineRun): ActualPreview {
  if (!run.analysis.ok) return { outcome: "analysis_error", failCode: run.analysis.error.code };
  const { previewOutcome } = run.analysis.value;
  return previewOutcome.outcome === "analysis_failed"
    ? { outcome: "analysis_failed", failCode: previewOutcome.failCode }
    : { outcome: "preview_ready", failCode: null };
}

function actualKitOutcomeOf(run: PipelineRun): ActualKitOutcome {
  if (run.outcome.status === "ready") return "ready";
  return run.outcome.stage === "analyze" || run.outcome.stage === "confirm"
    ? "not_applicable"
    : "failed";
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsWholeText(text: string, searched: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(searched)}(?![\\p{L}\\p{N}])`, "iu").test(
    text,
  );
}

export function isPersonalDataCopied(
  extractionText: string,
  personalDataTextList: readonly string[],
): boolean {
  const compactText = extractionText.replace(PHONE_DIGIT_SEPARATOR_PATTERN, "");
  return personalDataTextList.some((text) => {
    const compactDigitText = text.replace(PHONE_DIGIT_SEPARATOR_PATTERN, "");
    return /^\d+$/.test(compactDigitText)
      ? compactText.includes(compactDigitText)
      : containsWholeText(extractionText, text);
  });
}

export function isMaterialCopied(
  extractionText: string,
  materialPhraseList: readonly string[],
): boolean {
  const lowerText = extractionText.toLowerCase();
  return materialPhraseList.some((phrase) => lowerText.includes(phrase.toLowerCase()));
}

function checkExtraction(
  regressionCase: RegressionCase,
  { run, photoExtractionList }: Extract<CaseRunOutcome, { kind: "ran" }>,
  textReference: CaseTextReference,
): { readonly failedCheckList: CaseCheckCode[]; readonly warningList: string[] } {
  const { expectedPreview } = regressionCase;
  const merged = run.analysis.ok ? run.analysis.value.mergedExtraction : emptyMergedExtraction;
  const candidateIdList = merged.topicCandidateList.map((candidate) => candidate.topicId);
  const expectedIdList = [
    ...expectedPreview.requiredTopicIdList,
    ...expectedPreview.acceptableTopicIdList,
  ];
  const unexpectedList = merged.topicCandidateList.filter(
    (candidate) => !expectedIdList.includes(candidate.topicId),
  );
  const flaggedIdList = merged.unsupportedTopicList.map((topic) => topic.unsupportedTopicId);
  const warningCodeList = merged.sourceWarningList.map((warning) => warning.code);
  const failedCheckList: CaseCheckCode[] = [];
  if (expectedPreview.requiredTopicIdList.some((topicId) => !candidateIdList.includes(topicId))) {
    failedCheckList.push("required_topic_missing");
  }
  if (unexpectedList.some((candidate) => candidate.confidence === "high")) {
    failedCheckList.push("unexpected_topic");
  }
  if (expectedPreview.unsupportedTopicIdList.some((topicId) => !flaggedIdList.includes(topicId))) {
    failedCheckList.push("unsupported_topic_missed");
  }
  const isLegibilityMismatch = regressionCase.photoList.some((photo, index) => {
    const mergedPhoto = merged.photoList[index];
    if (mergedPhoto === undefined) return false;
    return (
      (photo.expectedLegibility === "unreadable" && mergedPhoto.isUsable) ||
      (photo.expectedLegibility === "good" && !mergedPhoto.isUsable)
    );
  });
  if (isLegibilityMismatch) failedCheckList.push("legibility_mismatch");
  if (
    expectedPreview.requiredSourceWarningCodeList.some((code) => !warningCodeList.includes(code))
  ) {
    failedCheckList.push("source_warning_missed");
  }
  const extractionText = JSON.stringify({ photoExtractionList, merged });
  if (isPersonalDataCopied(extractionText, textReference.personalDataTextList)) {
    failedCheckList.push("personal_data_copied");
  }
  if (isMaterialCopied(extractionText, textReference.materialPhraseList)) {
    failedCheckList.push("material_copied");
  }
  const warningList = unexpectedList
    .filter((candidate) => candidate.confidence === "medium")
    .map((candidate) => `${UNEXPECTED_MEDIUM_TOPIC_WARNING}:${candidate.topicId}`);
  return { failedCheckList, warningList };
}

export function checkRegressionCase(
  regressionCase: RegressionCase,
  outcome: CaseRunOutcome,
  textReference: CaseTextReference,
): CaseCheck {
  if (outcome.kind === "crashed") {
    return {
      failedCheckList: ["kit_outcome_mismatch"],
      expectedKitOutcome: regressionCase.expectedKitOutcome,
      warningList: [],
      actualPreview: null,
      actualKitOutcome: "crashed",
    };
  }
  const { run } = outcome;
  const actualPreview = actualPreviewOf(run);
  const actualKitOutcome = actualKitOutcomeOf(run);
  const { expectedPreview } = regressionCase;
  const extraction = checkExtraction(regressionCase, outcome, textReference);
  const isAcceptedRefusal =
    actualPreview.outcome === "analysis_failed" &&
    actualPreview.failCode !== null &&
    expectedPreview.acceptableFailCodeList.some((code) => code === actualPreview.failCode);
  const isPreviewMismatch =
    !isAcceptedRefusal &&
    (actualPreview.outcome !== expectedPreview.outcome ||
      actualPreview.failCode !== expectedPreview.failCode);
  const expectedKitOutcome = isAcceptedRefusal
    ? "not_applicable"
    : regressionCase.expectedKitOutcome;
  const failedCheckList: CaseCheckCode[] = [
    ...(isPreviewMismatch ? (["preview_outcome_mismatch"] as const) : []),
    ...extraction.failedCheckList,
    ...(actualKitOutcome === expectedKitOutcome ? [] : (["kit_outcome_mismatch"] as const)),
  ];
  return {
    failedCheckList: caseCheckCodeList.filter((code) => failedCheckList.includes(code)),
    expectedKitOutcome,
    warningList: extraction.warningList,
    actualPreview,
    actualKitOutcome,
  };
}

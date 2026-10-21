import {
  ACTIVITIES_PAGE_RANGE,
  ANSWER_KEY_PAGE_RANGE,
  type CountRange,
  createValidationIssue,
  err,
  ok,
  RENDER_RETRY_COUNT,
  type Result,
  type StudyKit,
  type ValidationIssue,
} from "@gizito/core";
import { loadRenderAssets } from "#src/render/assets.ts";
import type { RenderDocument } from "#src/render/document.ts";
import {
  errorNameOf,
  type PdfRenderer,
  type PdfRenderFailure,
  type RenderedPdf,
} from "#src/render/pdf-renderer.ts";
import { kitTemplateMap } from "#src/render/templates/index.ts";

export type KitRenderRequest = {
  readonly studyKit: StudyKit;
  readonly generatedAt: Date;
};

export type KitRenderDependencies = {
  readonly pdfRenderer: PdfRenderer;
  readonly retryCount?: number;
};

export type RenderedKitFile = RenderedPdf & { readonly attemptCount: number };

export type RenderedKit = {
  readonly activities: RenderedKitFile;
  readonly answerKey: RenderedKitFile;
  readonly warningList: readonly ValidationIssue[];
  readonly durationMs: number;
};

export type KitRenderFailure = {
  readonly code: "render_failed";
  readonly issueList: readonly ValidationIssue[];
  readonly errorNameList: readonly string[];
  readonly durationMs: number;
};

async function renderWithRetry(
  pdfRenderer: PdfRenderer,
  renderDocument: RenderDocument,
  attemptLimit: number,
  attemptCount = 1,
): Promise<Result<RenderedKitFile, PdfRenderFailure>> {
  const result = await pdfRenderer.render(renderDocument);
  if (result.ok) return ok({ ...result.value, attemptCount });
  if (attemptCount >= attemptLimit) return result;
  return renderWithRetry(pdfRenderer, renderDocument, attemptLimit, attemptCount + 1);
}

function isOutsideRange(count: number, range: CountRange): boolean {
  return count < range.min || count > range.max;
}

async function buildDocumentPair({
  studyKit,
  generatedAt,
}: KitRenderRequest): Promise<Result<readonly [RenderDocument, RenderDocument], PdfRenderFailure>> {
  try {
    const context = { assets: await loadRenderAssets(), generatedAt };
    const template = kitTemplateMap[studyKit.formatVersion];
    return ok([template.activities(studyKit, context), template.answerKey(studyKit, context)]);
  } catch (error) {
    return err({
      issueList: [createValidationIssue("render_failed")],
      errorName: errorNameOf(error),
    });
  }
}

function renderFailureOf(
  failureList: readonly PdfRenderFailure[],
  durationMs: number,
): KitRenderFailure {
  return {
    code: "render_failed",
    issueList: failureList.flatMap((failure) => failure.issueList),
    errorNameList: failureList.flatMap((failure) =>
      failure.errorName === null ? [] : [failure.errorName],
    ),
    durationMs,
  };
}

export async function renderKit(
  request: KitRenderRequest,
  { pdfRenderer, retryCount = RENDER_RETRY_COUNT }: KitRenderDependencies,
): Promise<Result<RenderedKit, KitRenderFailure>> {
  const startedAt = performance.now();
  const elapsedMs = () => Math.round(performance.now() - startedAt);
  const documentPair = await buildDocumentPair(request);
  if (!documentPair.ok) return err(renderFailureOf([documentPair.error], elapsedMs()));
  const [activitiesDocument, answerKeyDocument] = documentPair.value;
  const attemptLimit = 1 + retryCount;
  const [activities, answerKey] = await Promise.all([
    renderWithRetry(pdfRenderer, activitiesDocument, attemptLimit),
    renderWithRetry(pdfRenderer, answerKeyDocument, attemptLimit),
  ]);
  if (!activities.ok || !answerKey.ok) {
    const failureList = [activities, answerKey].flatMap((result) =>
      result.ok ? [] : [result.error],
    );
    return err(renderFailureOf(failureList, elapsedMs()));
  }
  const warningList =
    isOutsideRange(activities.value.pageCount, ACTIVITIES_PAGE_RANGE) ||
    isOutsideRange(answerKey.value.pageCount, ANSWER_KEY_PAGE_RANGE)
      ? [createValidationIssue("page_count_out_of_range")]
      : [];
  return ok({
    activities: activities.value,
    answerKey: answerKey.value,
    warningList,
    durationMs: elapsedMs(),
  });
}

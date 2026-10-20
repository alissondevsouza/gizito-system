import { createHash } from "node:crypto";
import {
  type AiFailureCode,
  type AiImage,
  type AiProvider,
  decidePreviewOutcome,
  EXTRACT_OUTPUT_RETRY_COUNT,
  type ExtractionContext,
  err,
  isRetryableAiFailureCode,
  MAX_PHOTO_COUNT,
  type MergedExtraction,
  mergePhotoExtractionList,
  ok,
  type PhotoExtraction,
  type PreviewOutcome,
  photoDeleteDeadline,
  photoExtractionSchema,
  type Result,
  sanitizePhotoExtraction,
  TAXONOMY_VERSION,
  type ValidationIssue,
} from "@gizito/core";
import { type AiCallRecord, toAiCallRecord } from "#src/pipeline/ai-call.ts";
import { buildExtractionCacheKey, type ExtractionCache } from "#src/pipeline/extraction-cache.ts";
import {
  buildExtractPrompt,
  EXTRACT_PROMPT_VERSION,
  type ExtractPrompt,
} from "#src/pipeline/prompts/extract/v1.ts";

export type ExtractionPhoto = {
  readonly image: AiImage;
  readonly insertDatetime: Date;
};

export type ExtractionDependencies = {
  readonly aiProvider: AiProvider;
  readonly cache: ExtractionCache;
  readonly extractModel: string;
  readonly now: () => Date;
  readonly signal?: AbortSignal;
};

export const photoExtractionStatusList = ["cached", "extracted", "failed"] as const;
export type PhotoExtractionStatus = (typeof photoExtractionStatusList)[number];

export type MaterialAnalysis = {
  readonly mergedExtraction: MergedExtraction;
  readonly previewOutcome: PreviewOutcome;
  readonly photoStatusList: readonly PhotoExtractionStatus[];
  readonly aiCallList: readonly AiCallRecord[];
};

export type ExtractionFailure = {
  readonly code: AiFailureCode;
  readonly isRetryable: boolean;
  readonly aiCallList: readonly AiCallRecord[];
};

export const invalidOutputCodeList: readonly AiFailureCode[] = [
  "ai_output_invalid",
  "ai_output_truncated",
  "ai_refused",
];

type PhotoResult = {
  readonly status: PhotoExtractionStatus;
  readonly extraction: PhotoExtraction | null;
  readonly issueList: readonly ValidationIssue[];
};

type PhotoOutcome =
  | ({ readonly kind: "done"; readonly aiCallList: readonly AiCallRecord[] } & PhotoResult)
  | {
      readonly kind: "stage_failed";
      readonly code: AiFailureCode;
      readonly aiCallList: readonly AiCallRecord[];
    };

export function computeContentHash(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

async function extractPhoto(
  photo: ExtractionPhoto,
  context: ExtractionContext,
  prompt: ExtractPrompt,
  dependencies: ExtractionDependencies,
): Promise<PhotoOutcome> {
  const { aiProvider, cache, extractModel, now, signal } = dependencies;
  const key = buildExtractionCacheKey({
    contentHash: computeContentHash(photo.image.data),
    grade: context.grade,
    subject: context.subject,
    taxonomyVersion: TAXONOMY_VERSION,
    promptVersion: EXTRACT_PROMPT_VERSION,
    model: extractModel,
  });
  const cached = await cache.find(key);
  if (cached !== null && cached.expireDatetime.getTime() > now().getTime()) {
    return {
      kind: "done",
      status: "cached",
      extraction: cached.extraction,
      issueList: cached.issueList,
      aiCallList: [],
    };
  }
  const aiCallList: AiCallRecord[] = [];
  for (let attempt = 0; attempt <= EXTRACT_OUTPUT_RETRY_COUNT; attempt += 1) {
    const result = await aiProvider.extract({
      promptVersion: EXTRACT_PROMPT_VERSION,
      systemPrompt: prompt.systemPrompt,
      userText: prompt.userText,
      imageList: [photo.image],
      outputSchema: photoExtractionSchema,
      signal,
    });
    aiCallList.push(toAiCallRecord("extract", result));
    if (result.ok) {
      const { extraction, issueList } = sanitizePhotoExtraction(result.value.output, context);
      await cache.save(key, {
        extraction,
        issueList,
        expireDatetime: photoDeleteDeadline(photo.insertDatetime),
      });
      return { kind: "done", status: "extracted", extraction, issueList, aiCallList };
    }
    if (result.error.code === "ai_image_invalid") break;
    if (!invalidOutputCodeList.includes(result.error.code)) {
      return { kind: "stage_failed", code: result.error.code, aiCallList };
    }
  }
  return { kind: "done", status: "failed", extraction: null, issueList: [], aiCallList };
}

async function settleAll<T>(promiseList: readonly Promise<T>[]): Promise<T[]> {
  const settledList = await Promise.allSettled(promiseList);
  return settledList.map((settled) => {
    if (settled.status === "rejected") throw settled.reason;
    return settled.value;
  });
}

export async function analyzeMaterial(
  photoList: readonly ExtractionPhoto[],
  context: ExtractionContext,
  dependencies: ExtractionDependencies,
): Promise<Result<MaterialAnalysis, ExtractionFailure>> {
  if (photoList.length === 0 || photoList.length > MAX_PHOTO_COUNT) {
    throw new RangeError(
      `análise pede de 1 a ${MAX_PHOTO_COUNT} fotos, recebeu ${photoList.length}`,
    );
  }
  const prompt = buildExtractPrompt(context);
  const outcomeList = await settleAll(
    photoList.map((photo) => extractPhoto(photo, context, prompt, dependencies)),
  );
  const aiCallList = outcomeList.flatMap((outcome) => outcome.aiCallList);
  const photoResultList: PhotoResult[] = [];
  for (const outcome of outcomeList) {
    if (outcome.kind === "stage_failed") {
      return err({
        code: outcome.code,
        isRetryable: isRetryableAiFailureCode(outcome.code),
        aiCallList,
      });
    }
    photoResultList.push(outcome);
  }
  const merged = mergePhotoExtractionList(
    photoResultList.map((result) => result.extraction),
    context,
  );
  const mergedExtraction: MergedExtraction = {
    ...merged,
    issueList: [...photoResultList.flatMap((result) => result.issueList), ...merged.issueList],
  };
  return ok({
    mergedExtraction,
    previewOutcome: decidePreviewOutcome(mergedExtraction),
    photoStatusList: photoResultList.map((result) => result.status),
    aiCallList,
  });
}

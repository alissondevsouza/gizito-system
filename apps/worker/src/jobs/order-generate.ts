import {
  type AiProvider,
  buildGenerationInput,
  err,
  type GenerationInput,
  isAiProviderIncidentCode,
  jobErrorCodeMap,
  type KitFileKind,
  kitStorageKey,
  type MathEvaluator,
  type ObjectStorage,
  ObjectStorageError,
  type OutcomeCode,
  ok,
  type Result,
  type StorageKey,
} from "@gizito/core";
import {
  type ClaimedJob,
  type Database,
  type ExhaustedJobHandler,
  failOrderGeneration,
  type JobFailure,
  type JobHandlerContext,
  OrderNotFoundError,
  publishKit,
  recordAiCallList,
  startOrderGeneration,
  sumOrderAiCostCents,
} from "@gizito/db";
import type { Logger } from "@gizito/integrations";
import type { AiCallRecord } from "#src/pipeline/ai-call.ts";
import {
  type GeneratedKit,
  type GenerationAttempt,
  type GenerationFailure,
  generateKit,
} from "#src/pipeline/generate.ts";
import type { MathMarkupParser } from "#src/pipeline/math-markup.ts";
import type { PdfRenderer } from "#src/render/pdf-renderer.ts";
import { type RenderedKit, renderKit } from "#src/render/render-kit.ts";
import type { JobDefinition } from "#src/runner/lanes.ts";

export const GENERATE_STAGE = "generate";
export const KIT_PUBLISHED_LOG_MESSAGE = "kit publicado";
export const GENERATION_FAILED_LOG_MESSAGE = "geração falhou";
export const GENERATION_RETRY_LOG_MESSAGE = "geração volta à fila";
export const PROVIDER_INCIDENT_LOG_MESSAGE = "incidente do provedor";
export const PUBLISH_NO_EFFECT_LOG_MESSAGE = "publicação sem efeito";
export const GENERATION_SKIPPED_LOG_MESSAGE = "geração pulada";
export const KIT_OBJECT_DELETE_FAILED_ERROR_CODE = "kit_object_delete_failed";
export const GENERATION_ABORTED_ERROR_CODE = "generation_aborted";

export type OrderGenerateDependencies = {
  readonly db: Database;
  readonly aiProvider: AiProvider;
  readonly storage: ObjectStorage;
  readonly mathEvaluator: MathEvaluator;
  readonly isMathMarkupParsable: MathMarkupParser;
  readonly pdfRenderer: PdfRenderer;
  readonly logger: Logger;
  readonly now: () => Date;
};

type JobResult = Result<null, JobFailure>;

type RunSummary = {
  readonly orderId: string;
  readonly stage: typeof GENERATE_STAGE;
  readonly durationMs: number;
  readonly costCents: number;
  readonly aiCallCount: number;
  readonly repairList: readonly GenerationAttempt["repair"][];
};

type KitObjectKeyMap = Readonly<Record<KitFileKind, StorageKey>>;

function costCentsOf(aiCallList: readonly AiCallRecord[]): number {
  return aiCallList.reduce((total, record) => total + record.costCents, 0);
}

function isIncident(failure: GenerationFailure): boolean {
  return !failure.isRetryable && isAiProviderIncidentCode(failure.code);
}

export function createOrderGenerateJob(dependencies: OrderGenerateDependencies): JobDefinition {
  const { db, aiProvider, storage, mathEvaluator, isMathMarkupParsable, pdfRenderer, logger, now } =
    dependencies;

  function summaryOf(
    orderId: string,
    startTime: number,
    aiCallList: readonly AiCallRecord[],
    attemptList: readonly GenerationAttempt[],
  ): RunSummary {
    return {
      orderId,
      stage: GENERATE_STAGE,
      durationMs: Math.round(performance.now() - startTime),
      costCents: costCentsOf(aiCallList),
      aiCallCount: aiCallList.length,
      repairList: attemptList.map((attempt) => attempt.repair),
    };
  }

  async function failDefinitively(
    summary: RunSummary,
    failReasonCode: OutcomeCode,
    detail: Record<string, unknown> = {},
  ): Promise<JobResult> {
    const failed = await db.transaction((tx) =>
      failOrderGeneration(tx, { orderId: summary.orderId, failReasonCode }),
    );
    if (!failed.ok) {
      logger.warn(
        {
          ...summary,
          ...detail,
          outcome: "no_effect",
          errorCode: failReasonCode,
          reasonCode: failed.error.code,
        },
        GENERATION_FAILED_LOG_MESSAGE,
      );
      return ok(null);
    }
    logger.error(
      {
        ...summary,
        ...detail,
        outcome: "failed",
        status: failed.value.status,
        errorCode: failReasonCode,
      },
      GENERATION_FAILED_LOG_MESSAGE,
    );
    return err({ errorCode: failReasonCode, retryable: false });
  }

  function retryLater(
    summary: RunSummary,
    errorCode: string,
    isProviderIncident: boolean,
  ): JobResult {
    const entry = { ...summary, outcome: "retry", errorCode };
    if (isProviderIncident) logger.error(entry, PROVIDER_INCIDENT_LOG_MESSAGE);
    else logger.warn(entry, GENERATION_RETRY_LOG_MESSAGE);
    return err({ errorCode, retryable: true });
  }

  async function deleteKitObjects(orderId: string, keyMap: KitObjectKeyMap): Promise<void> {
    for (const key of Object.values(keyMap)) {
      try {
        await storage.delete(key);
      } catch (error) {
        if (!(error instanceof ObjectStorageError)) throw error;
        logger.warn(
          {
            orderId,
            stage: GENERATE_STAGE,
            errorCode: KIT_OBJECT_DELETE_FAILED_ERROR_CODE,
            storageErrorCode: error.code,
          },
          "remoção do pdf órfão falhou",
        );
      }
    }
  }

  async function uploadKit(
    orderId: string,
    keyMap: KitObjectKeyMap,
    rendered: RenderedKit,
  ): Promise<Result<null, ObjectStorageError>> {
    const bodyByKind: Readonly<Record<KitFileKind, Uint8Array<ArrayBuffer>>> = {
      activities: rendered.activities.bytes,
      answer_key: rendered.answerKey.bytes,
    };
    const settledList = await Promise.allSettled(
      (Object.keys(keyMap) as KitFileKind[]).map((kind) =>
        storage.putPrivate({
          key: keyMap[kind],
          body: bodyByKind[kind],
          contentType: "application/pdf",
        }),
      ),
    );
    const rejected = settledList.find((settled) => settled.status === "rejected");
    if (rejected === undefined) return ok(null);
    await deleteKitObjects(orderId, keyMap);
    if (!(rejected.reason instanceof ObjectStorageError)) throw rejected.reason;
    return err(rejected.reason);
  }

  async function publish(
    orderId: string,
    input: GenerationInput,
    startTime: number,
    generated: GeneratedKit,
    signal: AbortSignal,
  ): Promise<JobResult> {
    const { studyKit, attemptList, aiCallList } = generated;
    const summary = () => summaryOf(orderId, startTime, aiCallList, attemptList);
    if (signal.aborted) return retryLater(summary(), GENERATION_ABORTED_ERROR_CODE, false);
    const rendered = await renderKit({ studyKit, generatedAt: now() }, { pdfRenderer });
    if (!rendered.ok) {
      return failDefinitively(summary(), rendered.error.code, {
        renderIssueCodeList: rendered.error.issueList.map((issue) => issue.code),
        renderErrorNameList: rendered.error.errorNameList,
      });
    }
    const kitId = crypto.randomUUID();
    const keyMap: KitObjectKeyMap = {
      activities: kitStorageKey(orderId, kitId, "activities"),
      answer_key: kitStorageKey(orderId, kitId, "answer_key"),
    };
    const uploaded = await uploadKit(orderId, keyMap, rendered.value);
    if (!uploaded.ok) {
      return retryLater(summary(), uploaded.error.code, uploaded.error.code === "storage_rejected");
    }
    const pageCountActivities = rendered.value.activities.pageCount;
    const pageCountAnswerKey = rendered.value.answerKey.pageCount;
    const published = await db.transaction((tx) =>
      publishKit(
        tx,
        {
          orderId,
          kitId,
          studyKit,
          generationVersion: studyKit.generationVersion,
          taxonomyVersion: studyKit.taxonomyVersion,
          activitiesStorageKey: keyMap.activities,
          answerKeyStorageKey: keyMap.answer_key,
          pageCountActivities,
          pageCountAnswerKey,
        },
        { now: now() },
      ),
    );
    const detail = {
      kitId,
      pageCountActivities,
      pageCountAnswerKey,
      warningCodeList: rendered.value.warningList.map((issue) => issue.code),
      topicCount: input.topicRefList.length,
    };
    if (!published.ok) {
      await deleteKitObjects(orderId, keyMap);
      if (published.error instanceof OrderNotFoundError) {
        return err({ errorCode: published.error.code, retryable: false });
      }
      logger.warn(
        { ...summary(), ...detail, outcome: "no_effect", errorCode: published.error.code },
        PUBLISH_NO_EFFECT_LOG_MESSAGE,
      );
      return ok(null);
    }
    logger.info(
      { ...summary(), ...detail, outcome: "ready", status: "ready" },
      KIT_PUBLISHED_LOG_MESSAGE,
    );
    return ok(null);
  }

  async function handle(claimedJob: ClaimedJob, context: JobHandlerContext): Promise<JobResult> {
    const { payload } = claimedJob;
    if (payload.name !== "order.generate") {
      return err({ errorCode: jobErrorCodeMap.payloadInvalid, retryable: false });
    }
    const { orderId } = payload;
    const startTime = performance.now();
    const started = await db.transaction((tx) => startOrderGeneration(tx, orderId));
    if (!started.ok) return err({ errorCode: started.error.code, retryable: false });
    const start = started.value;
    if (start.decision === "skip") {
      logger.info(
        { orderId, stage: GENERATE_STAGE, status: start.status, outcome: "skip" },
        GENERATION_SKIPPED_LOG_MESSAGE,
      );
      return ok(null);
    }
    const input = buildGenerationInput(start.fields);
    if (!input.ok) {
      return failDefinitively(summaryOf(orderId, startTime, [], []), input.error.code, {
        reasonCode: input.error.reason,
      });
    }
    const spentCostCents = await sumOrderAiCostCents(db, orderId);
    const generation = await generateKit(input.value, {
      aiProvider,
      mathEvaluator,
      isMathMarkupParsable,
      spentCostCents,
      onAiCall: (record) => recordAiCallList(db, orderId, [record]),
      signal: context.signal,
    });
    if (!generation.ok) {
      const failure = generation.error;
      const summary = summaryOf(orderId, startTime, failure.aiCallList, failure.attemptList);
      if (failure.isRetryable || isIncident(failure)) {
        return retryLater(summary, failure.code, isIncident(failure));
      }
      return failDefinitively(summary, failure.code, { spentCostCents });
    }
    return publish(orderId, input.value, startTime, generation.value, context.signal);
  }

  const onExhausted: ExhaustedJobHandler = async (tx, exhaustedJob) => {
    if (exhaustedJob.payload.name !== "order.generate") return;
    await failOrderGeneration(tx, {
      orderId: exhaustedJob.payload.orderId,
      failReasonCode: exhaustedJob.errorCode,
    });
  };

  return { handle, onExhausted };
}

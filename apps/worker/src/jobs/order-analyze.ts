import {
  type AiProvider,
  buildOrderAnalysis,
  err,
  jobErrorCodeMap,
  type ObjectStorage,
  ObjectStorageError,
  type OrderAnalysis,
  ok,
  type Result,
  unavailableOrderAnalysis,
} from "@gizito/core";
import {
  type AnalysisPhoto,
  AnalysisPhotoSetChangedError,
  type ClaimedJob,
  type Database,
  type ExhaustedJobHandler,
  findExtractionCacheEntry,
  finishOrderAnalysis,
  type JobFailure,
  type JobHandlerContext,
  recordAiCallList,
  saveExtractionCacheEntry,
  startOrderAnalysis,
} from "@gizito/db";
import type { Logger } from "@gizito/integrations";
import type { AiCallRecord } from "#src/pipeline/ai-call.ts";
import { analyzeMaterial, type ExtractionPhoto } from "#src/pipeline/extract.ts";
import type { ExtractionCache } from "#src/pipeline/extraction-cache.ts";
import type { JobDefinition } from "#src/runner/lanes.ts";

export const ANALYZE_STAGE = "analyze";
export const LEASE_LOST_ERROR_CODE = "lease_lost";
export const NO_CURRENT_PHOTO_ERROR_CODE = "no_current_photo";

export type OrderAnalyzeDependencies = {
  readonly db: Database;
  readonly aiProvider: AiProvider;
  readonly storage: ObjectStorage;
  readonly extractModel: string;
  readonly logger: Logger;
  readonly now: () => Date;
};

type JobResult = Result<null, JobFailure>;

type AnalysisEnd = {
  readonly analysis: OrderAnalysis;
  readonly aiCallList: readonly AiCallRecord[];
  readonly errorCode?: string;
};

class AnalysisRollback extends Error {
  constructor(readonly failure: JobFailure | null) {
    super("order analysis transaction rolled back");
    this.name = "AnalysisRollback";
  }
}

const leaseLostFailure: JobFailure = { errorCode: LEASE_LOST_ERROR_CODE, retryable: true };

export function createDatabaseExtractionCache(db: Database): ExtractionCache {
  return {
    find: (key) => findExtractionCacheEntry(db, key),
    save: (key, entry) => saveExtractionCacheEntry(db, key, entry),
  };
}

function costCentsOf(aiCallList: readonly AiCallRecord[]): number {
  return aiCallList.reduce((total, record) => total + record.costCents, 0);
}

async function rollbackOutcome<T>(run: () => Promise<T>): Promise<Result<T, JobFailure | null>> {
  try {
    return ok(await run());
  } catch (error) {
    if (error instanceof AnalysisRollback) return err(error.failure);
    throw error;
  }
}

async function readPhotoList(
  storage: ObjectStorage,
  photoList: readonly AnalysisPhoto[],
): Promise<ExtractionPhoto[]> {
  return Promise.all(
    photoList.map(async ({ storageKey, insertDatetime }) => ({
      image: { mediaType: "image/jpeg" as const, data: await storage.get(storageKey) },
      insertDatetime,
    })),
  );
}

export function createOrderAnalyzeJob(dependencies: OrderAnalyzeDependencies): JobDefinition {
  const { db, aiProvider, storage, extractModel, logger, now } = dependencies;
  const cache = createDatabaseExtractionCache(db);

  async function finish(
    orderId: string,
    { completeWithin }: JobHandlerContext,
    { analysis, aiCallList, errorCode }: AnalysisEnd,
    startTime: number,
  ): Promise<JobResult> {
    const finished = await rollbackOutcome(() =>
      db.transaction(async (tx) => {
        if (!(await completeWithin(tx))) throw new AnalysisRollback(leaseLostFailure);
        const result = await finishOrderAnalysis(tx, { orderId, analysis });
        if (result.ok) return result.value;
        if (result.error instanceof AnalysisPhotoSetChangedError) {
          throw new AnalysisRollback({ errorCode: result.error.code, retryable: true });
        }
        throw new AnalysisRollback(null);
      }),
    );
    const summary = {
      orderId,
      stage: ANALYZE_STAGE,
      durationMs: Math.round(performance.now() - startTime),
      costCents: costCentsOf(aiCallList),
      aiCallCount: aiCallList.length,
    };
    if (!finished.ok) {
      if (finished.error !== null) return err(finished.error);
      logger.warn(
        { ...summary, outcome: "no_effect" },
        "análise sem efeito: o pedido saiu de analyzing",
      );
      return ok(null);
    }
    const failCode = analysis.outcome === "analysis_failed" ? analysis.failCode : undefined;
    const entry = {
      ...summary,
      outcome: analysis.outcome,
      status: finished.value,
      failCode,
      errorCode,
    };
    if (analysis.outcome === "analysis_unavailable") logger.error(entry, "análise indisponível");
    else logger.info(entry, "análise concluída");
    return ok(null);
  }

  async function handle(claimedJob: ClaimedJob, context: JobHandlerContext): Promise<JobResult> {
    const { payload } = claimedJob;
    if (payload.name !== "order.analyze") {
      return err({ errorCode: jobErrorCodeMap.payloadInvalid, retryable: false });
    }
    const { orderId } = payload;
    const startTime = performance.now();
    const started = await rollbackOutcome(() =>
      db.transaction(async (tx) => {
        const result = await startOrderAnalysis(tx, orderId);
        if (result.ok && result.value.decision === "skip" && !(await context.completeWithin(tx))) {
          throw new AnalysisRollback(leaseLostFailure);
        }
        return result;
      }),
    );
    if (!started.ok) return err(started.error ?? leaseLostFailure);
    if (!started.value.ok) {
      return err({ errorCode: started.value.error.code, retryable: false });
    }
    const start = started.value.value;
    if (start.decision === "skip") {
      logger.info(
        { orderId, stage: ANALYZE_STAGE, status: start.status, outcome: "skip" },
        "análise pulada",
      );
      return ok(null);
    }
    const unavailable = (errorCode: string, aiCallList: readonly AiCallRecord[] = []) =>
      finish(
        orderId,
        context,
        { analysis: unavailableOrderAnalysis, aiCallList, errorCode },
        startTime,
      );
    if (start.photoList.length === 0) return unavailable(NO_CURRENT_PHOTO_ERROR_CODE);

    let photoList: ExtractionPhoto[];
    try {
      photoList = await readPhotoList(storage, start.photoList);
    } catch (error) {
      if (!(error instanceof ObjectStorageError)) throw error;
      if (error.code === "storage_unavailable")
        return err({ errorCode: error.code, retryable: true });
      return unavailable(error.code);
    }

    const analyzed = await analyzeMaterial(
      photoList,
      { grade: start.grade, subject: start.subject },
      { aiProvider, cache, extractModel, now, signal: context.signal },
    );
    const aiCallList = analyzed.ok ? analyzed.value.aiCallList : analyzed.error.aiCallList;
    await recordAiCallList(db, orderId, aiCallList);
    if (!analyzed.ok) {
      if (analyzed.error.isRetryable)
        return err({ errorCode: analyzed.error.code, retryable: true });
      return unavailable(analyzed.error.code, aiCallList);
    }
    const analysis = buildOrderAnalysis(
      start.photoList.map((photo) => photo.orderPhotoId),
      analyzed.value.mergedExtraction,
      analyzed.value.previewOutcome,
    );
    return finish(orderId, context, { analysis, aiCallList }, startTime);
  }

  const onExhausted: ExhaustedJobHandler = async (tx, exhaustedJob) => {
    if (exhaustedJob.payload.name !== "order.analyze") return;
    await finishOrderAnalysis(tx, {
      orderId: exhaustedJob.payload.orderId,
      analysis: unavailableOrderAnalysis,
    });
  };

  return { handle, onExhausted };
}

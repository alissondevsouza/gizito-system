import {
  type AnalysisStartDecision,
  analysisEventOf,
  decideAnalysisStart,
  err,
  type Grade,
  type InvalidTransitionError,
  type OrderAnalysis,
  type OrderStatus,
  ok,
  orderAnalysisSchema,
  type Result,
  type Subject,
  transitionOrder,
} from "@gizito/core";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { Executor, Transaction } from "#src/client.ts";
import { AnalysisPhotoSetChangedError, OrderNotFoundError } from "#src/order/errors.ts";
import { aiCall, order, orderPhoto } from "#src/schema/index.ts";

export type AnalysisPhoto = {
  readonly orderPhotoId: string;
  readonly storageKey: string;
  readonly insertDatetime: Date;
};

export type OrderAnalysisStart =
  | { readonly decision: Extract<AnalysisStartDecision, "skip">; readonly status: OrderStatus }
  | {
      readonly decision: Exclude<AnalysisStartDecision, "skip">;
      readonly grade: Grade;
      readonly subject: Subject;
      readonly photoList: readonly AnalysisPhoto[];
    };

export type StartOrderAnalysisError = OrderNotFoundError | InvalidTransitionError;

export type FinishOrderAnalysisInput = {
  readonly orderId: string;
  readonly analysis: OrderAnalysis;
};

export type FinishOrderAnalysisError =
  | OrderNotFoundError
  | InvalidTransitionError
  | AnalysisPhotoSetChangedError;

export type AiCallValue = Pick<
  typeof aiCall.$inferInsert,
  | "stage"
  | "model"
  | "promptVersion"
  | "inputTokenCount"
  | "outputTokenCount"
  | "costCents"
  | "durationMs"
  | "outcomeCode"
>;

async function lockOrder(tx: Transaction, orderId: string) {
  const [locked] = await tx
    .select({
      status: order.status,
      grade: order.grade,
      subject: order.subject,
      analysis: order.analysis,
    })
    .from(order)
    .where(eq(order.orderId, orderId))
    .for("update");
  return locked ?? null;
}

async function listAnalysisPhotos(tx: Transaction, orderId: string): Promise<AnalysisPhoto[]> {
  return tx
    .select({
      orderPhotoId: orderPhoto.orderPhotoId,
      storageKey: orderPhoto.storageKey,
      insertDatetime: orderPhoto.insertDatetime,
    })
    .from(orderPhoto)
    .where(
      and(
        eq(orderPhoto.orderId, orderId),
        isNull(orderPhoto.replacedDatetime),
        isNull(orderPhoto.deleteDatetime),
      ),
    )
    .orderBy(asc(orderPhoto.photoIndex));
}

export async function startOrderAnalysis(
  tx: Transaction,
  orderId: string,
): Promise<Result<OrderAnalysisStart, StartOrderAnalysisError>> {
  const locked = await lockOrder(tx, orderId);
  if (locked === null) return err(new OrderNotFoundError(orderId));
  const decision = decideAnalysisStart(locked.status, locked.analysis !== null);
  if (decision === "skip") return ok({ decision, status: locked.status });
  if (decision === "start") {
    const transition = transitionOrder(locked.status, "start_analysis");
    if (!transition.ok) return err(transition.error);
    await tx.update(order).set({ status: transition.value }).where(eq(order.orderId, orderId));
  }
  return ok({
    decision,
    grade: locked.grade,
    subject: locked.subject,
    photoList: await listAnalysisPhotos(tx, orderId),
  });
}

function isSamePhotoList(currentIdList: readonly string[], analyzedIdList: readonly string[]) {
  return (
    currentIdList.length === analyzedIdList.length &&
    currentIdList.every((orderPhotoId, position) => orderPhotoId === analyzedIdList[position])
  );
}

export async function finishOrderAnalysis(
  tx: Transaction,
  input: FinishOrderAnalysisInput,
): Promise<Result<OrderStatus, FinishOrderAnalysisError>> {
  const { orderId } = input;
  const analysis = orderAnalysisSchema.parse(input.analysis);
  const locked = await lockOrder(tx, orderId);
  if (locked === null) return err(new OrderNotFoundError(orderId));
  const transition = transitionOrder(locked.status, analysisEventOf(analysis));
  if (!transition.ok) return err(transition.error);
  if (analysis.outcome !== "analysis_unavailable") {
    const currentList = await listAnalysisPhotos(tx, orderId);
    const currentIdList = currentList.map((photo) => photo.orderPhotoId);
    if (!isSamePhotoList(currentIdList, analysis.analyzedPhotoIdList)) {
      return err(new AnalysisPhotoSetChangedError(orderId));
    }
    for (const [position, orderPhotoId] of analysis.analyzedPhotoIdList.entries()) {
      const legibilityScore = analysis.mergedExtraction.photoList[position]?.legibilityScore;
      await tx
        .update(orderPhoto)
        .set({ legibilityScore: legibilityScore ?? null })
        .where(eq(orderPhoto.orderPhotoId, orderPhotoId));
    }
  }
  await tx
    .update(order)
    .set({
      status: transition.value,
      analysis,
      materialProfile:
        analysis.outcome === "preview_ready" ? analysis.mergedExtraction.materialProfile : null,
    })
    .where(eq(order.orderId, orderId));
  return ok(transition.value);
}

export async function recordAiCallList(
  executor: Executor,
  orderId: string,
  aiCallValueList: readonly AiCallValue[],
): Promise<void> {
  if (aiCallValueList.length === 0) return;
  await executor.insert(aiCall).values(aiCallValueList.map((value) => ({ ...value, orderId })));
}

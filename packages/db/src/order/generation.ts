import {
  decideGenerationStart,
  err,
  type GenerationOrderFields,
  type GenerationStartDecision,
  type InvalidTransitionError,
  type OrderStatus,
  type OutcomeCode,
  ok,
  type Result,
  transitionOrder,
} from "@gizito/core";
import { eq, sum } from "drizzle-orm";
import type { Executor, Transaction } from "#src/client.ts";
import { OrderNotFoundError } from "#src/order/errors.ts";
import { enqueueJob } from "#src/queue/enqueue.ts";
import { aiCall, order } from "#src/schema/index.ts";

export type OrderGenerationStart =
  | { readonly decision: Extract<GenerationStartDecision, "skip">; readonly status: OrderStatus }
  | {
      readonly decision: Exclude<GenerationStartDecision, "skip">;
      readonly fields: GenerationOrderFields;
    };

export type OrderGenerationError = OrderNotFoundError | InvalidTransitionError;

export type FailOrderGenerationInput = {
  readonly orderId: string;
  readonly failReasonCode: OutcomeCode;
};

export type FailedOrderGeneration = {
  readonly status: OrderStatus;
  readonly notifyJobId: string;
};

async function lockOrderStatus(tx: Transaction, orderId: string): Promise<OrderStatus | null> {
  const [locked] = await tx
    .select({ status: order.status })
    .from(order)
    .where(eq(order.orderId, orderId))
    .for("update");
  return locked?.status ?? null;
}

export async function startOrderGeneration(
  tx: Transaction,
  orderId: string,
): Promise<Result<OrderGenerationStart, OrderGenerationError>> {
  const [locked] = await tx
    .select({
      status: order.status,
      grade: order.grade,
      subject: order.subject,
      topicIdList: order.topicIdList,
      otherTopicText: order.otherTopicText,
      perceivedDifficulty: order.perceivedDifficulty,
      noteText: order.noteText,
      materialProfile: order.materialProfile,
      analysis: order.analysis,
    })
    .from(order)
    .where(eq(order.orderId, orderId))
    .for("update");
  if (!locked) return err(new OrderNotFoundError(orderId));
  const { status, ...fields } = locked;
  const decision = decideGenerationStart(status);
  if (decision === "skip") return ok({ decision, status });
  if (decision === "start") {
    const transition = transitionOrder(status, "generation_started");
    if (!transition.ok) return err(transition.error);
    await tx
      .update(order)
      .set({ status: transition.value, failReasonCode: null })
      .where(eq(order.orderId, orderId));
  }
  return ok({ decision, fields });
}

export async function failOrderGeneration(
  tx: Transaction,
  { orderId, failReasonCode }: FailOrderGenerationInput,
): Promise<Result<FailedOrderGeneration, OrderGenerationError>> {
  const status = await lockOrderStatus(tx, orderId);
  if (status === null) return err(new OrderNotFoundError(orderId));
  const transition = transitionOrder(status, "generation_failed");
  if (!transition.ok) return err(transition.error);
  await tx
    .update(order)
    .set({ status: transition.value, failReasonCode })
    .where(eq(order.orderId, orderId));
  const notifyJob = await enqueueJob(tx, { name: "order.notify", orderId, kind: "kit_failed" });
  return ok({ status: transition.value, notifyJobId: notifyJob.jobId });
}

export async function sumOrderAiCostCents(executor: Executor, orderId: string): Promise<number> {
  const [row] = await executor
    .select({ total: sum(aiCall.costCents) })
    .from(aiCall)
    .where(eq(aiCall.orderId, orderId));
  return Number(row?.total ?? 0);
}

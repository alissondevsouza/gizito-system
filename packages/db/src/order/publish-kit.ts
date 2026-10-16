import {
  err,
  type InvalidTransitionError,
  ok,
  type PublishKitInput,
  publishKitInputSchema,
  type Result,
  transitionOrder,
} from "@gizito/core";
import { eq } from "drizzle-orm";
import type { Transaction } from "#src/client.ts";
import { OrderNotFoundError } from "#src/order/errors.ts";
import { enqueueJob } from "#src/queue/enqueue.ts";
import { kit, order } from "#src/schema/index.ts";

export type PublishKitOutcome = {
  kitId: string;
  notifyJobId: string;
};

export type PublishKitError = OrderNotFoundError | InvalidTransitionError;

export type PublishKitOptions = {
  now?: Date;
};

export async function publishKit(
  tx: Transaction,
  input: PublishKitInput,
  { now = new Date() }: PublishKitOptions = {},
): Promise<Result<PublishKitOutcome, PublishKitError>> {
  const { orderId, ...kitValues } = publishKitInputSchema.parse(input);
  const [lockedOrder] = await tx
    .select({ status: order.status })
    .from(order)
    .where(eq(order.orderId, orderId))
    .for("update");
  if (!lockedOrder) return err(new OrderNotFoundError(orderId));
  const transition = transitionOrder(lockedOrder.status, "kit_published");
  if (!transition.ok) return err(transition.error);
  await tx.insert(kit).values({ ...kitValues, orderId, publishedDatetime: now });
  await tx
    .update(order)
    .set({ status: transition.value, readyDatetime: now })
    .where(eq(order.orderId, orderId));
  const notifyJob = await enqueueJob(tx, { name: "order.notify", orderId, kind: "kit_ready" });
  return ok({ kitId: kitValues.kitId, notifyJobId: notifyJob.jobId });
}

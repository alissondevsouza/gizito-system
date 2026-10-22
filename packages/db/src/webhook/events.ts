import type { OutcomeCode, WebhookSource } from "@gizito/core";
import { eq } from "drizzle-orm";
import type { Executor } from "#src/client.ts";
import { webhookEvent } from "#src/schema/index.ts";

export type ProcessedWebhookEvent = {
  outcomeCode: OutcomeCode;
  now: Date;
};

export type RecordWebhookEventInput = {
  source: WebhookSource;
  externalId: string;
  processed?: ProcessedWebhookEvent;
};

export type RecordedWebhookEvent = {
  webhookEventId: string;
};

export async function recordWebhookEvent(
  executor: Executor,
  { source, externalId, processed }: RecordWebhookEventInput,
): Promise<RecordedWebhookEvent | null> {
  const [row] = await executor
    .insert(webhookEvent)
    .values({
      source,
      externalId,
      ...(processed === undefined
        ? {}
        : { processedDatetime: processed.now, outcomeCode: processed.outcomeCode }),
    })
    .onConflictDoNothing({ target: [webhookEvent.source, webhookEvent.externalId] })
    .returning({ webhookEventId: webhookEvent.webhookEventId });
  return row ?? null;
}

export async function markWebhookEventProcessed(
  executor: Executor,
  webhookEventId: string,
  { outcomeCode, now }: ProcessedWebhookEvent,
): Promise<boolean> {
  const rowList = await executor
    .update(webhookEvent)
    .set({ processedDatetime: now, outcomeCode })
    .where(eq(webhookEvent.webhookEventId, webhookEventId))
    .returning({ webhookEventId: webhookEvent.webhookEventId });
  return rowList.length > 0;
}

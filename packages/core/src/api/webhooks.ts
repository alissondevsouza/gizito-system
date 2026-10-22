import { z } from "zod";

export const webhookAckOutcomeList = ["queued", "duplicate", "ignored", "unknown_charge"] as const;
export const webhookAckOutcomeSchema = z.enum(webhookAckOutcomeList);
export type WebhookAckOutcome = z.infer<typeof webhookAckOutcomeSchema>;

export const webhookAckSchema = z.object({ outcome: webhookAckOutcomeSchema });
export type WebhookAck = z.infer<typeof webhookAckSchema>;

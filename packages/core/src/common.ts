import { z } from "zod";

export const guidSchema = z.guid();
export type Guid = z.infer<typeof guidSchema>;

export const outcomeCodeSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/)
  .max(64);
export type OutcomeCode = z.infer<typeof outcomeCodeSchema>;

export const timestampFieldsSchema = z.object({
  insertDatetime: z.date(),
  updateDatetime: z.date(),
});
export type TimestampFields = z.infer<typeof timestampFieldsSchema>;

export function errorNameOf(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

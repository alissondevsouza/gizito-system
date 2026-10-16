import { z } from "zod";
import { guidSchema } from "#src/common.ts";
import { kitStorageKey, storageKeySchema } from "#src/storage/keys.ts";

export const publishKitInputSchema = z
  .object({
    orderId: guidSchema,
    kitId: guidSchema,
    studyKit: z.record(z.string(), z.unknown()),
    generationVersion: z.string().min(1),
    taxonomyVersion: z.string().min(1),
    activitiesStorageKey: storageKeySchema,
    answerKeyStorageKey: storageKeySchema,
    pageCountActivities: z.int().positive(),
    pageCountAnswerKey: z.int().positive(),
  })
  .refine(
    (input) =>
      input.activitiesStorageKey === kitStorageKey(input.orderId, input.kitId, "activities"),
    {
      message: "activitiesStorageKey must be the kit activities key",
      path: ["activitiesStorageKey"],
    },
  )
  .refine(
    (input) =>
      input.answerKeyStorageKey === kitStorageKey(input.orderId, input.kitId, "answer_key"),
    { message: "answerKeyStorageKey must be the kit answer key", path: ["answerKeyStorageKey"] },
  );
export type PublishKitInput = z.infer<typeof publishKitInputSchema>;

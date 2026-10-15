import { z } from "zod";
import { guidSchema, outcomeCodeSchema, timestampFieldsSchema } from "#src/common.ts";
import {
  MAX_EMAIL_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_OTHER_TOPIC_LENGTH,
  MAX_TOPIC_COUNT,
  PUBLIC_TOKEN_LENGTH,
  SHORT_CODE_ALPHABET,
  SHORT_CODE_LENGTH,
  SHORT_CODE_PREFIX,
} from "#src/constants.ts";
import {
  gradeSchema,
  orderStatusSchema,
  perceivedDifficultySchema,
  subjectSchema,
} from "#src/enums.ts";

const PUBLIC_TOKEN_CANONICAL_LAST_CHAR_CLASS = "[AEIMQUYcgkosw048]";

export const publicTokenSchema = z
  .string()
  .regex(
    new RegExp(
      `^[A-Za-z0-9_-]{${PUBLIC_TOKEN_LENGTH - 1}}${PUBLIC_TOKEN_CANONICAL_LAST_CHAR_CLASS}$`,
    ),
  );
export type PublicToken = z.infer<typeof publicTokenSchema>;

export const shortCodeSchema = z
  .string()
  .regex(new RegExp(`^${SHORT_CODE_PREFIX}[${SHORT_CODE_ALPHABET}]{${SHORT_CODE_LENGTH}}$`));
export type ShortCode = z.infer<typeof shortCodeSchema>;

export const emailSchema = z.email().max(MAX_EMAIL_LENGTH);
export type Email = z.infer<typeof emailSchema>;

export const phoneSchema = z.string().regex(/^\+[1-9]\d{9,14}$/);
export type Phone = z.infer<typeof phoneSchema>;

export const noteTextSchema = z.string().trim().max(MAX_NOTE_LENGTH);
export const otherTopicTextSchema = z.string().trim().min(2).max(MAX_OTHER_TOPIC_LENGTH);

export const topicIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/)
  .max(64);
export type TopicId = z.infer<typeof topicIdSchema>;
export const topicIdListSchema = z.array(topicIdSchema).max(MAX_TOPIC_COUNT);

export const orderSchema = timestampFieldsSchema
  .extend({
    orderId: guidSchema,
    publicToken: publicTokenSchema,
    shortCode: shortCodeSchema,
    status: orderStatusSchema,
    grade: gradeSchema,
    subject: subjectSchema,
    email: emailSchema.nullable(),
    topicIdList: topicIdListSchema,
    otherTopicText: otherTopicTextSchema.nullable(),
    noteText: noteTextSchema.nullable(),
    perceivedDifficulty: perceivedDifficultySchema.nullable(),
    materialProfile: z.unknown().nullable(),
    whatsappPhone: phoneSchema.nullable(),
    whatsappConsentDatetime: z.date().nullable(),
    paidDatetime: z.date().nullable(),
    readyDatetime: z.date().nullable(),
    failReasonCode: outcomeCodeSchema.nullable(),
  })
  .refine((order) => (order.whatsappPhone === null) === (order.whatsappConsentDatetime === null), {
    message: "whatsappPhone and whatsappConsentDatetime must be set together",
    path: ["whatsappConsentDatetime"],
  });
export type Order = z.infer<typeof orderSchema>;

export const contentHashSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const orderPhotoSchema = timestampFieldsSchema.extend({
  orderPhotoId: guidSchema,
  orderId: guidSchema,
  storageKey: z.string().min(1),
  contentHash: contentHashSchema,
  width: z.int().positive(),
  height: z.int().positive(),
  legibilityScore: z.number().min(0).max(1).nullable(),
  deleteDatetime: z.date().nullable(),
});
export type OrderPhoto = z.infer<typeof orderPhotoSchema>;

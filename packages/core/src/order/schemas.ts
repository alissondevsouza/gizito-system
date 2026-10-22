import { z } from "zod";
import { guidSchema, outcomeCodeSchema, timestampFieldsSchema } from "#src/common.ts";
import {
  MAX_EMAIL_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_OTHER_TOPIC_LENGTH,
  MAX_TOPIC_COUNT,
  MIN_OTHER_TOPIC_LENGTH,
  MIN_TOPIC_COUNT,
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
import { photoIndexSchema } from "#src/order/photo.ts";
import { isConfirmedOrderStatus } from "#src/order/state-machine.ts";
import { storageKeySchema } from "#src/storage/keys.ts";

const BASE64URL_32_BYTE_LAST_CHAR_CLASS = "[AEIMQUYcgkosw048]";

export function base64Url32ByteSchema(length: number) {
  return z
    .string()
    .regex(new RegExp(`^[A-Za-z0-9_-]{${length - 1}}${BASE64URL_32_BYTE_LAST_CHAR_CLASS}$`));
}

export const publicTokenSchema = base64Url32ByteSchema(PUBLIC_TOKEN_LENGTH);
export type PublicToken = z.infer<typeof publicTokenSchema>;

export const shortCodeSchema = z
  .string()
  .regex(new RegExp(`^${SHORT_CODE_PREFIX}[${SHORT_CODE_ALPHABET}]{${SHORT_CODE_LENGTH}}$`));
export type ShortCode = z.infer<typeof shortCodeSchema>;

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(MAX_EMAIL_LENGTH));
export type Email = z.infer<typeof emailSchema>;

export const phoneSchema = z.string().regex(/^\+[1-9]\d{9,14}$/);
export type Phone = z.infer<typeof phoneSchema>;

export const noteTextSchema = z.string().trim().max(MAX_NOTE_LENGTH);
export const otherTopicTextSchema = z
  .string()
  .trim()
  .min(MIN_OTHER_TOPIC_LENGTH)
  .max(MAX_OTHER_TOPIC_LENGTH);

export const topicIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/)
  .max(64);
export type TopicId = z.infer<typeof topicIdSchema>;
export const topicIdListSchema = z
  .array(topicIdSchema)
  .max(MAX_TOPIC_COUNT)
  .refine((topicIdList) => new Set(topicIdList).size === topicIdList.length, {
    message: "topicIdList must not repeat a topic",
  });

export function countOrderTopics(
  topicIdList: readonly TopicId[],
  otherTopicText: string | null,
): number {
  return topicIdList.length + (otherTopicText === null ? 0 : 1);
}

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
  })
  .refine((order) => countOrderTopics(order.topicIdList, order.otherTopicText) <= MAX_TOPIC_COUNT, {
    message: "an order covers at most MAX_TOPIC_COUNT topics, other topic included",
    path: ["topicIdList"],
  })
  .refine(
    (order) =>
      !isConfirmedOrderStatus(order.status) ||
      countOrderTopics(order.topicIdList, order.otherTopicText) >= MIN_TOPIC_COUNT,
    {
      message: "a confirmed order covers at least MIN_TOPIC_COUNT topic",
      path: ["topicIdList"],
    },
  );
export type Order = z.infer<typeof orderSchema>;

export const contentHashSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const orderPhotoSchema = timestampFieldsSchema.extend({
  orderPhotoId: guidSchema,
  orderId: guidSchema,
  photoIndex: photoIndexSchema,
  storageKey: storageKeySchema,
  contentHash: contentHashSchema,
  width: z.int().positive(),
  height: z.int().positive(),
  legibilityScore: z.number().min(0).max(1).nullable(),
  replacedDatetime: z.date().nullable(),
  deleteDatetime: z.date().nullable(),
});
export type OrderPhoto = z.infer<typeof orderPhotoSchema>;

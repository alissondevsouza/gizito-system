import { z } from "zod";
import {
  MAX_NOTE_LENGTH,
  MAX_OTHER_TOPIC_LENGTH,
  MAX_TOPIC_COUNT,
  MIN_TOPIC_COUNT,
} from "#src/constants.ts";
import { type Grade, perceivedDifficultySchema, type Subject } from "#src/enums.ts";
import {
  countOrderTopics,
  emailSchema,
  noteTextSchema,
  otherTopicTextSchema,
  type TopicId,
  topicIdListSchema,
} from "#src/order/schemas.ts";
import { isSelectableTopic } from "#src/pedagogy/taxonomy/index.ts";
import {
  findUnsupportedTopicList,
  type UnsupportedTopicId,
} from "#src/pedagogy/taxonomy/unsupported.ts";
import { err, ok, type Result } from "#src/result.ts";
import { sanitizeUntrustedText } from "#src/text/sanitize.ts";

export const RAW_UNTRUSTED_TEXT_LENGTH_FACTOR = 4;

function optionalUntrustedTextSchema<Output extends string>(
  maxLength: number,
  schema: z.ZodType<Output, string>,
) {
  return z
    .string()
    .max(maxLength * RAW_UNTRUSTED_TEXT_LENGTH_FACTOR)
    .transform(sanitizeUntrustedText)
    .transform((text) => (text === "" ? undefined : text))
    .pipe(schema.optional())
    .optional();
}

export const confirmOrderInputSchema = z
  .object({
    topicIdList: topicIdListSchema.default([]),
    otherTopicText: optionalUntrustedTextSchema(MAX_OTHER_TOPIC_LENGTH, otherTopicTextSchema),
    email: emailSchema,
    noteText: optionalUntrustedTextSchema(MAX_NOTE_LENGTH, noteTextSchema),
    perceivedDifficulty: perceivedDifficultySchema.optional(),
    acceptedTerms: z.literal(true),
  })
  .refine(
    ({ topicIdList, otherTopicText }) => {
      const topicCount = countOrderTopics(topicIdList, otherTopicText ?? null);
      return topicCount >= MIN_TOPIC_COUNT && topicCount <= MAX_TOPIC_COUNT;
    },
    {
      message: "an order covers between MIN_TOPIC_COUNT and MAX_TOPIC_COUNT topics, other included",
      path: ["topicIdList"],
    },
  );
export type ConfirmOrderInput = z.infer<typeof confirmOrderInputSchema>;

export type ConfirmedTopicSelection = {
  readonly topicIdList: readonly TopicId[];
  readonly otherTopicText: string | null;
};

export type ConfirmedTopicError =
  | { readonly code: "invalid_topic"; readonly topicId: TopicId }
  | {
      readonly code: "unsupported_topic";
      readonly unsupportedTopicIdList: readonly UnsupportedTopicId[];
    };

export function checkConfirmedTopics(
  { topicIdList, otherTopicText }: ConfirmedTopicSelection,
  grade: Grade,
  subject: Subject,
): Result<void, ConfirmedTopicError> {
  const invalidTopicId = topicIdList.find((topicId) => !isSelectableTopic(topicId, grade, subject));
  if (invalidTopicId !== undefined) return err({ code: "invalid_topic", topicId: invalidTopicId });
  if (otherTopicText === null) return ok(undefined);
  const unsupportedList = findUnsupportedTopicList(otherTopicText, subject);
  if (unsupportedList.length === 0) return ok(undefined);
  return err({
    code: "unsupported_topic",
    unsupportedTopicIdList: unsupportedList.map((topic) => topic.unsupportedTopicId),
  });
}

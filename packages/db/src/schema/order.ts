import type { TopicId } from "@gizito/core";
import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import {
  gradeEnum,
  orderStatusEnum,
  perceivedDifficultyEnum,
  subjectEnum,
} from "#src/schema/enums.ts";
import { datetime, timestampColumnMap } from "#src/schema/timestamps.ts";

export const order = pgTable(
  "order",
  {
    orderId: uuid("order_id").primaryKey().defaultRandom(),
    publicToken: text("public_token").notNull(),
    shortCode: text("short_code").notNull(),
    status: orderStatusEnum("status").notNull().default("draft"),
    grade: gradeEnum("grade").notNull(),
    subject: subjectEnum("subject").notNull(),
    email: text("email"),
    topicIdList: jsonb("topic_id_list").$type<TopicId[]>().notNull().default([]),
    otherTopicText: text("other_topic_text"),
    noteText: text("note_text"),
    perceivedDifficulty: perceivedDifficultyEnum("perceived_difficulty"),
    materialProfile: jsonb("material_profile"),
    whatsappPhone: text("whatsapp_phone"),
    whatsappConsentDatetime: datetime("whatsapp_consent_datetime"),
    paidDatetime: datetime("paid_datetime"),
    readyDatetime: datetime("ready_datetime"),
    failReasonCode: text("fail_reason_code"),
    ...timestampColumnMap,
  },
  (table) => [
    uniqueIndex("order_public_token_idx").on(table.publicToken),
    uniqueIndex("order_short_code_idx").on(table.shortCode),
    index("order_status_update_datetime_idx").on(table.status, table.updateDatetime),
    index("order_email_idx").on(table.email),
    check(
      "order_whatsapp_consent_check",
      sql`(${table.whatsappPhone} IS NULL) = (${table.whatsappConsentDatetime} IS NULL)`,
    ),
  ],
);

import {
  aiStageList,
  chargeStatusList,
  gradeList,
  notificationChannelList,
  notificationKindList,
  notificationStatusList,
  orderStatusList,
  paymentGatewayList,
  perceivedDifficultyList,
  subjectList,
  supportTicketKindList,
  supportTicketStatusList,
  webhookSourceList,
} from "@gizito/core";
import { pgEnum } from "drizzle-orm/pg-core";

export const orderStatusEnum = pgEnum("order_status", orderStatusList);
export const gradeEnum = pgEnum("grade", gradeList);
export const subjectEnum = pgEnum("subject", subjectList);
export const chargeStatusEnum = pgEnum("charge_status", chargeStatusList);
export const paymentGatewayEnum = pgEnum("payment_gateway", paymentGatewayList);
export const perceivedDifficultyEnum = pgEnum("perceived_difficulty", perceivedDifficultyList);
export const aiStageEnum = pgEnum("ai_stage", aiStageList);
export const notificationChannelEnum = pgEnum("notification_channel", notificationChannelList);
export const notificationKindEnum = pgEnum("notification_kind", notificationKindList);
export const notificationStatusEnum = pgEnum("notification_status", notificationStatusList);
export const webhookSourceEnum = pgEnum("webhook_source", webhookSourceList);
export const supportTicketKindEnum = pgEnum("support_ticket_kind", supportTicketKindList);
export const supportTicketStatusEnum = pgEnum("support_ticket_status", supportTicketStatusList);

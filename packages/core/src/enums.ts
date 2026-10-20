import { z } from "zod";

export const gradeList = ["4", "5", "6", "7"] as const;
export const gradeSchema = z.enum(gradeList);
export type Grade = z.infer<typeof gradeSchema>;
export const gradeLabelMap: Readonly<Record<Grade, string>> = {
  "4": "4º ano",
  "5": "5º ano",
  "6": "6º ano",
  "7": "7º ano",
};

export const subjectList = ["math", "portuguese"] as const;
export const subjectSchema = z.enum(subjectList);
export type Subject = z.infer<typeof subjectSchema>;
export const subjectLabelMap: Readonly<Record<Subject, string>> = {
  math: "Matemática",
  portuguese: "Língua Portuguesa",
};

export const orderStatusList = [
  "draft",
  "analyzing",
  "preview_ready",
  "awaiting_payment",
  "paid",
  "processing",
  "ready",
  "failed",
  "refunded",
] as const;
export const orderStatusSchema = z.enum(orderStatusList);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const awaitingPaymentSubstateList = ["charge_expired"] as const;
export const awaitingPaymentSubstateSchema = z.enum(awaitingPaymentSubstateList);
export type AwaitingPaymentSubstate = z.infer<typeof awaitingPaymentSubstateSchema>;

export const chargeStatusList = ["pending", "paid", "expired", "refunded"] as const;
export const chargeStatusSchema = z.enum(chargeStatusList);
export type ChargeStatus = z.infer<typeof chargeStatusSchema>;

export const paymentGatewayList = ["mercadopago", "asaas", "fake"] as const;
export const paymentGatewaySchema = z.enum(paymentGatewayList);
export type PaymentGatewayName = z.infer<typeof paymentGatewaySchema>;

export const questionTypeList = ["multiple_choice", "open_answer"] as const;
export const questionTypeSchema = z.enum(questionTypeList);
export type QuestionType = z.infer<typeof questionTypeSchema>;

export const difficultyList = ["easy", "medium", "hard"] as const;
export const difficultySchema = z.enum(difficultyList);
export type Difficulty = z.infer<typeof difficultySchema>;

export const perceivedDifficultyList = ["basic", "intermediate", "unknown"] as const;
export const perceivedDifficultySchema = z.enum(perceivedDifficultyList);
export type PerceivedDifficulty = z.infer<typeof perceivedDifficultySchema>;

export const legibilityList = ["good", "partial", "unreadable"] as const;
export const legibilitySchema = z.enum(legibilityList);
export type Legibility = z.infer<typeof legibilitySchema>;

export const questionBlockList = ["practice", "mock"] as const;
export const questionBlockSchema = z.enum(questionBlockList);
export type QuestionBlock = z.infer<typeof questionBlockSchema>;

export const jobNameList = [
  "order.analyze",
  "order.generate",
  "order.notify",
  "charge.reconcile",
  "retention.purge",
  "whatsapp.inbound",
] as const;
export const jobNameSchema = z.enum(jobNameList);
export type JobName = z.infer<typeof jobNameSchema>;

export const jobStatusList = ["pending", "active", "completed", "failed"] as const;
export const jobStatusSchema = z.enum(jobStatusList);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const aiStageList = ["extract", "plan", "generate", "review"] as const;
export const aiStageSchema = z.enum(aiStageList);
export type AiStage = z.infer<typeof aiStageSchema>;

export const notificationChannelList = ["email", "whatsapp"] as const;
export const notificationChannelSchema = z.enum(notificationChannelList);
export type NotificationChannelName = z.infer<typeof notificationChannelSchema>;

export const notificationKindList = [
  "order_link",
  "kit_ready",
  "kit_failed",
  "whatsapp_linked",
  "whatsapp_unlinked",
  "whatsapp_help",
] as const;
export const notificationKindSchema = z.enum(notificationKindList);
export type NotificationKind = z.infer<typeof notificationKindSchema>;

export const notificationStatusList = ["pending", "sent", "failed", "skipped"] as const;
export const notificationStatusSchema = z.enum(notificationStatusList);
export type NotificationStatus = z.infer<typeof notificationStatusSchema>;

export const webhookSourceList = ["mercadopago", "whatsapp"] as const;
export const webhookSourceSchema = z.enum(webhookSourceList);
export type WebhookSource = z.infer<typeof webhookSourceSchema>;

export const supportTicketKindList = [
  "content_error",
  "delivery_problem",
  "duplicate_payment",
  "other",
] as const;
export const supportTicketKindSchema = z.enum(supportTicketKindList);
export type SupportTicketKind = z.infer<typeof supportTicketKindSchema>;

export const supportTicketStatusList = ["open", "resolved"] as const;
export const supportTicketStatusSchema = z.enum(supportTicketStatusList);
export type SupportTicketStatus = z.infer<typeof supportTicketStatusSchema>;

export const kitFileKindList = ["activities", "answer_key"] as const;
export const kitFileKindSchema = z.enum(kitFileKindList);
export type KitFileKind = z.infer<typeof kitFileKindSchema>;

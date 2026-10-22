import { z } from "zod";
import { deriveAwaitingPaymentSubstate } from "#src/charge/rules.ts";
import type { Charge } from "#src/charge/schemas.ts";
import { guidSchema, httpsUrlSchema, webUrlSchema } from "#src/common.ts";
import {
  ANSWER_KEY_COUNT,
  KIT_PRICE_CENTS,
  MAX_PHOTO_COUNT,
  MAX_TOPIC_CANDIDATE_COUNT,
  MAX_TOPIC_COUNT,
  MOCK_QUESTION_COUNT,
  PRACTICE_QUESTION_COUNT,
  WORKED_EXAMPLE_COUNT,
} from "#src/constants.ts";
import {
  awaitingPaymentSubstateSchema,
  gradeSchema,
  type OrderStatus,
  subjectSchema,
} from "#src/enums.ts";
import { analysisFailCodeSchema, type OrderAnalysis } from "#src/order/analysis.ts";
import { maskEmail, maskedEmailSchema } from "#src/order/email.ts";
import { photoIndexSchema } from "#src/order/photo.ts";
import {
  otherTopicTextSchema,
  publicTokenSchema,
  shortCodeSchema,
  type TopicId,
} from "#src/order/schemas.ts";
import type { MergedExtraction } from "#src/pedagogy/extraction/merge.ts";
import {
  exerciseFormatSchema,
  notationSchema,
  photoIssueSchema,
  topicConfidenceSchema,
} from "#src/pedagogy/extraction/schemas.ts";
import { findTopic } from "#src/pedagogy/taxonomy/index.ts";
import { taxonomyTopicIdSchema } from "#src/pedagogy/taxonomy/schemas.ts";
import {
  unsupportedTopicIdSchema,
  unsupportedTopicList,
  unsupportedTopicReasonSchema,
} from "#src/pedagogy/taxonomy/unsupported.ts";

export const photoStageOrderStatusList = [
  "draft",
  "analyzing",
  "preview_ready",
] as const satisfies readonly OrderStatus[];

export const postPhotoStageOrderStatusList = [
  "awaiting_payment",
  "paid",
  "processing",
  "ready",
  "failed",
  "refunded",
] as const satisfies readonly OrderStatus[];

export const postConfirmationViewOrderStatusList = [
  "paid",
  "processing",
  "ready",
  "failed",
  "refunded",
] as const satisfies readonly OrderStatus[];

export const photoReplaceableOrderStatusList = [
  "draft",
  "preview_ready",
] as const satisfies readonly OrderStatus[];

export function isPhotoReplaceableOrderStatus(status: OrderStatus): boolean {
  return photoReplaceableOrderStatusList.some((replaceable) => replaceable === status);
}

export const orderPhotoViewSchema = z.object({
  orderPhotoId: guidSchema,
  photoIndex: photoIndexSchema,
  thumbnailUrl: webUrlSchema,
  legibilityScore: z.number().min(0).max(1).nullable(),
  isUsable: z.boolean().nullable(),
  photoIssueList: z.array(photoIssueSchema),
});
export type OrderPhotoView = z.infer<typeof orderPhotoViewSchema>;

export const unsupportedTopicViewSchema = z.object({
  unsupportedTopicId: unsupportedTopicIdSchema,
  label: z.string().min(1),
  reason: unsupportedTopicReasonSchema,
});
export type UnsupportedTopicView = z.infer<typeof unsupportedTopicViewSchema>;

export const analysisFailureViewSchema = z.object({
  failCode: analysisFailCodeSchema,
  isMaterialMismatch: z.boolean(),
  unsupportedTopicList: z.array(unsupportedTopicViewSchema),
});
export type AnalysisFailureView = z.infer<typeof analysisFailureViewSchema>;

export const topicCandidateViewSchema = z.object({
  topicId: taxonomyTopicIdSchema,
  label: z.string().min(1),
  confidence: topicConfidenceSchema,
});
export type TopicCandidateView = z.infer<typeof topicCandidateViewSchema>;

export const materialProfileViewSchema = z.object({
  exerciseFormatList: z.array(exerciseFormatSchema),
  notationList: z.array(notationSchema),
  isHandwritten: z.boolean(),
});
export type MaterialProfileView = z.infer<typeof materialProfileViewSchema>;

export const kitPreviewSchema = z.object({
  workedExampleCount: z.int().positive(),
  practiceQuestionCount: z.int().positive(),
  mockQuestionCount: z.int().positive(),
  answerKeyCount: z.int().positive(),
  priceCents: z.int().positive(),
});
export type KitPreview = z.infer<typeof kitPreviewSchema>;

export const kitPreview: KitPreview = {
  workedExampleCount: WORKED_EXAMPLE_COUNT,
  practiceQuestionCount: PRACTICE_QUESTION_COUNT,
  mockQuestionCount: MOCK_QUESTION_COUNT,
  answerKeyCount: ANSWER_KEY_COUNT,
  priceCents: KIT_PRICE_CENTS,
};

export const previewViewSchema = z.object({
  topicCandidateList: z.array(topicCandidateViewSchema).min(1).max(MAX_TOPIC_CANDIDATE_COUNT),
  unsupportedTopicList: z.array(unsupportedTopicViewSchema),
  materialProfile: materialProfileViewSchema,
  kitPreview: kitPreviewSchema,
});
export type PreviewView = z.infer<typeof previewViewSchema>;

export type PhotoAnalysisView = Pick<OrderPhotoView, "isUsable" | "photoIssueList">;

const pendingPhotoAnalysisView: PhotoAnalysisView = { isUsable: null, photoIssueList: [] };

export function photoAnalysisViewOf(
  analysis: OrderAnalysis | null,
  orderPhotoId: string,
): PhotoAnalysisView {
  if (analysis === null || analysis.outcome === "analysis_unavailable") {
    return pendingPhotoAnalysisView;
  }
  const position = analysis.analyzedPhotoIdList.indexOf(orderPhotoId);
  const mergedPhoto = analysis.mergedExtraction.photoList[position];
  if (mergedPhoto === undefined) return pendingPhotoAnalysisView;
  return { isUsable: mergedPhoto.isUsable, photoIssueList: [...mergedPhoto.photoIssueList] };
}

function unsupportedTopicViewListOf(mergedExtraction: MergedExtraction): UnsupportedTopicView[] {
  return mergedExtraction.unsupportedTopicList.flatMap(({ unsupportedTopicId }) => {
    const topic = unsupportedTopicList.find(
      (candidate) => candidate.unsupportedTopicId === unsupportedTopicId,
    );
    return topic === undefined
      ? []
      : [{ unsupportedTopicId, label: topic.label, reason: topic.reason }];
  });
}

export function analysisFailureViewOf(analysis: OrderAnalysis | null): AnalysisFailureView | null {
  if (analysis === null || analysis.outcome === "preview_ready") return null;
  if (analysis.outcome === "analysis_unavailable") {
    return { failCode: analysis.outcome, isMaterialMismatch: false, unsupportedTopicList: [] };
  }
  return {
    failCode: analysis.failCode,
    isMaterialMismatch: analysis.isMaterialMismatch,
    unsupportedTopicList: unsupportedTopicViewListOf(analysis.mergedExtraction),
  };
}

export function previewViewOf(analysis: OrderAnalysis): PreviewView | null {
  if (analysis.outcome !== "preview_ready") return null;
  const { mergedExtraction } = analysis;
  const { exerciseFormatList, notationList, isHandwritten } = mergedExtraction.materialProfile;
  return {
    topicCandidateList: mergedExtraction.topicCandidateList.flatMap(({ topicId, confidence }) => {
      const topic = findTopic(topicId);
      return topic === undefined ? [] : [{ topicId, label: topic.label, confidence }];
    }),
    unsupportedTopicList: unsupportedTopicViewListOf(mergedExtraction),
    materialProfile: { exerciseFormatList, notationList, isHandwritten },
    kitPreview,
  };
}

export const chargeViewSchema = z.object({
  amountCents: z.int().positive(),
  qrCode: z.string().min(1),
  qrCodeBase64: z.string().min(1).nullable(),
  ticketUrl: httpsUrlSchema.nullable(),
  expireDatetime: z.iso.datetime(),
});
export type ChargeView = z.infer<typeof chargeViewSchema>;

export const confirmedTopicViewSchema = z.object({
  topicId: taxonomyTopicIdSchema,
  label: z.string().min(1),
});
export type ConfirmedTopicView = z.infer<typeof confirmedTopicViewSchema>;

export const awaitingPaymentViewSchema = z.object({
  charge: chargeViewSchema,
  substate: awaitingPaymentSubstateSchema.nullable(),
  email: maskedEmailSchema,
  confirmedTopicList: z.array(confirmedTopicViewSchema).max(MAX_TOPIC_COUNT),
  otherTopicText: otherTopicTextSchema.nullable(),
  kitPreview: kitPreviewSchema,
});
export type AwaitingPaymentView = z.infer<typeof awaitingPaymentViewSchema>;

export type ViewedCharge = Pick<
  Charge,
  | "chargeId"
  | "status"
  | "amountCents"
  | "qrCode"
  | "qrCodeBase64"
  | "ticketUrl"
  | "expireDatetime"
  | "insertDatetime"
>;

function isMoreRecentCharge(candidate: ViewedCharge, current: ViewedCharge): boolean {
  const timeDifference = candidate.insertDatetime.getTime() - current.insertDatetime.getTime();
  return timeDifference > 0 || (timeDifference === 0 && candidate.chargeId > current.chargeId);
}

export function latestChargeOf<C extends ViewedCharge>(chargeList: readonly C[]): C | null {
  return chargeList.reduce<C | null>(
    (latest, charge) => (latest === null || isMoreRecentCharge(charge, latest) ? charge : latest),
    null,
  );
}

export type AwaitingPaymentSource = {
  readonly chargeList: readonly ViewedCharge[];
  readonly email: string;
  readonly topicIdList: readonly TopicId[];
  readonly otherTopicText: string | null;
};

export function awaitingPaymentViewOf(
  { chargeList, email, topicIdList, otherTopicText }: AwaitingPaymentSource,
  now: Date,
): AwaitingPaymentView | null {
  const charge = latestChargeOf(chargeList);
  if (charge === null) return null;
  return {
    charge: {
      amountCents: charge.amountCents,
      qrCode: charge.qrCode,
      qrCodeBase64: charge.qrCodeBase64,
      ticketUrl: charge.ticketUrl,
      expireDatetime: charge.expireDatetime.toISOString(),
    },
    substate: deriveAwaitingPaymentSubstate(charge, now),
    email: maskEmail(email),
    confirmedTopicList: topicIdList.flatMap((topicId) => {
      const topic = findTopic(topicId);
      return topic === undefined ? [] : [{ topicId, label: topic.label }];
    }),
    otherTopicText,
    kitPreview,
  };
}

const orderViewBaseSchema = z.object({
  publicToken: publicTokenSchema,
  shortCode: shortCodeSchema,
  grade: gradeSchema,
  subject: subjectSchema,
  insertDatetime: z.iso.datetime(),
});

const photoListViewSchema = z.array(orderPhotoViewSchema).max(MAX_PHOTO_COUNT);

export const orderViewSchema = z.discriminatedUnion("status", [
  orderViewBaseSchema.extend({
    status: z.literal("draft"),
    photoList: photoListViewSchema,
    analysisFailure: analysisFailureViewSchema.nullable(),
  }),
  orderViewBaseSchema.extend({
    status: z.literal("analyzing"),
    photoList: photoListViewSchema,
  }),
  orderViewBaseSchema.extend({
    status: z.literal("preview_ready"),
    photoList: photoListViewSchema,
    ...previewViewSchema.shape,
  }),
  orderViewBaseSchema.extend({
    status: z.literal("awaiting_payment"),
    ...awaitingPaymentViewSchema.shape,
  }),
  orderViewBaseSchema.extend({
    status: z.enum(postConfirmationViewOrderStatusList),
  }),
]);
export type OrderView = z.infer<typeof orderViewSchema>;

export const createOrderResponseSchema = z.object({
  publicToken: publicTokenSchema,
  shortCode: shortCodeSchema,
  status: z.literal("draft"),
});
export type CreateOrderResponse = z.infer<typeof createOrderResponseSchema>;

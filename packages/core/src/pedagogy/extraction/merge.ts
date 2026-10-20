import { z } from "zod";
import {
  LEGIBILITY_SCORE_MAP,
  MAX_CONTEXT_THEME_COUNT,
  MAX_TERMINOLOGY_COUNT,
  MAX_TOPIC_CANDIDATE_COUNT,
} from "#src/constants.ts";
import { type Grade, legibilitySchema, type Subject } from "#src/enums.ts";
import type { TopicId } from "#src/order/schemas.ts";
import {
  type ApparentLevel,
  apparentLevelList,
  type MaterialProfile,
  materialProfileSchema,
  type PhotoExtraction,
  photoIssueSchema,
  sourceWarningCodeList,
  sourceWarningCodeSchema,
  type TopicConfidence,
  topicConfidenceSchema,
} from "#src/pedagogy/extraction/schemas.ts";
import { isSelectableTopic, listTopics } from "#src/pedagogy/taxonomy/index.ts";
import { taxonomyTopicIdSchema } from "#src/pedagogy/taxonomy/schemas.ts";
import {
  unsupportedTopicIdSchema,
  unsupportedTopicList,
} from "#src/pedagogy/taxonomy/unsupported.ts";
import {
  createValidationIssue,
  type ValidationIssue,
  validationIssueSchema,
} from "#src/pedagogy/validation/issue.ts";
import { findPersonalDataExcerpt, normalizeSpacing } from "#src/pedagogy/validation/patterns.ts";

export const EVIDENCE_DROPPED_TEXT = "trecho descartado por conter dado pessoal";

export type ExtractionContext = { readonly grade: Grade; readonly subject: Subject };

export type SanitizedPhotoExtraction = {
  readonly extraction: PhotoExtraction;
  readonly issueList: readonly ValidationIssue[];
};

export function sanitizePhotoExtraction(
  extraction: PhotoExtraction,
  { grade, subject }: ExtractionContext,
): SanitizedPhotoExtraction {
  const issueList: ValidationIssue[] = [];
  const topicCandidateList = extraction.topicCandidateList.flatMap((candidate) => {
    if (!isSelectableTopic(candidate.topicId, grade, subject)) {
      issueList.push(
        createValidationIssue("extraction_unknown_topic", { itemId: candidate.topicId }),
      );
      return [];
    }
    if (findPersonalDataExcerpt(candidate.evidence) !== null) {
      issueList.push(createValidationIssue("extraction_personal_data_dropped"));
      return [{ ...candidate, evidence: EVIDENCE_DROPPED_TEXT }];
    }
    return [candidate];
  });
  const unsupportedTopicIdList = extraction.unsupportedTopicIdList.filter((unsupportedTopicId) => {
    const isKnown = unsupportedTopicList.some(
      (topic) => topic.unsupportedTopicId === unsupportedTopicId && topic.subject === subject,
    );
    if (!isKnown) issueList.push(createValidationIssue("extraction_unknown_unsupported_topic"));
    return isKnown;
  });
  const withoutPersonalData = (termList: readonly string[]) =>
    termList.filter((term) => {
      const hasPersonalData = findPersonalDataExcerpt(term) !== null;
      if (hasPersonalData)
        issueList.push(createValidationIssue("extraction_personal_data_dropped"));
      return !hasPersonalData;
    });
  return {
    extraction: {
      ...extraction,
      topicCandidateList,
      unsupportedTopicIdList,
      materialProfile: {
        ...extraction.materialProfile,
        notationList: subject === "portuguese" ? [] : extraction.materialProfile.notationList,
        terminologyList: withoutPersonalData(extraction.materialProfile.terminologyList),
        contextThemeList: withoutPersonalData(extraction.materialProfile.contextThemeList),
      },
    },
    issueList,
  };
}

const photoIndexListSchema = z.array(z.int().positive()).min(1);

export const mergedPhotoSchema = z.strictObject({
  photoIndex: z.int().positive(),
  legibility: legibilitySchema.nullable(),
  isUsable: z.boolean(),
  legibilityScore: z.number().min(0).max(1).nullable(),
  photoIssueList: z.array(photoIssueSchema),
});
export type MergedPhoto = z.infer<typeof mergedPhotoSchema>;

export const mergedTopicCandidateSchema = z.strictObject({
  topicId: taxonomyTopicIdSchema,
  confidence: topicConfidenceSchema,
  photoIndexList: photoIndexListSchema,
});
export type MergedTopicCandidate = z.infer<typeof mergedTopicCandidateSchema>;

export const mergedExtractionSchema = z.strictObject({
  photoList: z.array(mergedPhotoSchema),
  topicCandidateList: z.array(mergedTopicCandidateSchema).max(MAX_TOPIC_CANDIDATE_COUNT),
  unsupportedTopicList: z.array(
    z.strictObject({
      unsupportedTopicId: unsupportedTopicIdSchema,
      photoIndexList: photoIndexListSchema,
    }),
  ),
  sourceWarningList: z.array(
    z.strictObject({ code: sourceWarningCodeSchema, photoIndexList: photoIndexListSchema }),
  ),
  materialProfile: materialProfileSchema,
  issueList: z.array(validationIssueSchema),
});
export type MergedExtraction = z.infer<typeof mergedExtractionSchema>;

type IndexedExtraction = { readonly photoIndex: number; readonly extraction: PhotoExtraction };

type CandidateAccumulator = {
  readonly topicId: TopicId;
  confidence: TopicConfidence;
  readonly photoIndexList: number[];
  readonly firstPosition: number;
};

function isUsablePhoto(extraction: PhotoExtraction): boolean {
  return extraction.legibility !== "unreadable" && extraction.isSchoolMaterial;
}

function mergeTopicCandidateList(
  usableList: readonly IndexedExtraction[],
  { grade, subject }: ExtractionContext,
): MergedTopicCandidate[] {
  const accumulatorById = new Map<TopicId, CandidateAccumulator>();
  for (const { photoIndex, extraction } of usableList) {
    extraction.topicCandidateList.forEach((candidate, position) => {
      const accumulator = accumulatorById.get(candidate.topicId);
      if (accumulator === undefined) {
        accumulatorById.set(candidate.topicId, {
          topicId: candidate.topicId,
          confidence: candidate.confidence,
          photoIndexList: [photoIndex],
          firstPosition: position,
        });
        return;
      }
      accumulator.photoIndexList.push(photoIndex);
      if (candidate.confidence === "high") accumulator.confidence = "high";
    });
  }
  const taxonomyOrder = new Map(
    listTopics(grade, subject).map((topic, index) => [topic.topicId, index]),
  );
  const confidenceRank = (confidence: TopicConfidence) => (confidence === "high" ? 0 : 1);
  return [...accumulatorById.values()]
    .sort(
      (left, right) =>
        right.photoIndexList.length - left.photoIndexList.length ||
        confidenceRank(left.confidence) - confidenceRank(right.confidence) ||
        (left.photoIndexList[0] ?? 0) - (right.photoIndexList[0] ?? 0) ||
        left.firstPosition - right.firstPosition ||
        (taxonomyOrder.get(left.topicId) ?? 0) - (taxonomyOrder.get(right.topicId) ?? 0),
    )
    .slice(0, MAX_TOPIC_CANDIDATE_COUNT)
    .map(({ topicId, confidence, photoIndexList }) => ({ topicId, confidence, photoIndexList }));
}

function groupByPhoto<T>(
  indexedList: readonly IndexedExtraction[],
  valueListOf: (extraction: PhotoExtraction) => readonly T[],
  order: readonly T[],
): { value: T; photoIndexList: number[] }[] {
  const photoIndexListByValue = new Map<T, number[]>();
  for (const { photoIndex, extraction } of indexedList) {
    for (const value of valueListOf(extraction)) {
      const photoIndexList = photoIndexListByValue.get(value) ?? [];
      photoIndexList.push(photoIndex);
      photoIndexListByValue.set(value, photoIndexList);
    }
  }
  return order.flatMap((value) => {
    const photoIndexList = photoIndexListByValue.get(value);
    return photoIndexList === undefined ? [] : [{ value, photoIndexList }];
  });
}

function unionInOrder<T>(listList: readonly (readonly T[])[], keyOf: (value: T) => string): T[] {
  const seenKeySet = new Set<string>();
  const result: T[] = [];
  for (const value of listList.flat()) {
    const key = keyOf(value);
    if (seenKeySet.has(key)) continue;
    seenKeySet.add(key);
    result.push(value);
  }
  return result;
}

function mostFrequentApparentLevel(levelList: readonly ApparentLevel[]): ApparentLevel {
  const countOf = (level: ApparentLevel) => levelList.filter((value) => value === level).length;
  const topCount = Math.max(0, ...apparentLevelList.map(countOf));
  const topLevelList = apparentLevelList.filter((level) => countOf(level) === topCount);
  return topLevelList.length === 1 && topLevelList[0] !== undefined ? topLevelList[0] : "at_grade";
}

function mergeMaterialProfile(
  usableList: readonly IndexedExtraction[],
  subject: Subject,
): MaterialProfile {
  const profileList = usableList.map(({ extraction }) => extraction.materialProfile);
  const termKey = (term: string) => normalizeSpacing(term).toLowerCase();
  return {
    exerciseFormatList: unionInOrder(
      profileList.map((profile) => profile.exerciseFormatList),
      String,
    ),
    notationList:
      subject === "portuguese"
        ? []
        : unionInOrder(
            profileList.map((profile) => profile.notationList),
            String,
          ),
    terminologyList: unionInOrder(
      profileList.map((profile) => profile.terminologyList),
      termKey,
    ).slice(0, MAX_TERMINOLOGY_COUNT),
    contextThemeList: unionInOrder(
      profileList.map((profile) => profile.contextThemeList),
      termKey,
    ).slice(0, MAX_CONTEXT_THEME_COUNT),
    apparentLevel: mostFrequentApparentLevel(profileList.map((profile) => profile.apparentLevel)),
    hasFigures: profileList.some((profile) => profile.hasFigures),
    isHandwritten: profileList.some((profile) => profile.isHandwritten),
  };
}

export function mergePhotoExtractionList(
  photoExtractionList: readonly (PhotoExtraction | null)[],
  context: ExtractionContext,
): MergedExtraction {
  const issueList: ValidationIssue[] = [];
  const validList: IndexedExtraction[] = [];
  const photoList = photoExtractionList.map((rawExtraction, index): MergedPhoto => {
    const photoIndex = index + 1;
    if (rawExtraction === null) {
      issueList.push(createValidationIssue("extraction_output_invalid"));
      return {
        photoIndex,
        legibility: null,
        isUsable: false,
        legibilityScore: null,
        photoIssueList: [],
      };
    }
    const sanitized = sanitizePhotoExtraction(rawExtraction, context);
    const isUsable = isUsablePhoto(sanitized.extraction);
    issueList.push(...sanitized.issueList);
    validList.push({ photoIndex, extraction: sanitized.extraction });
    return {
      photoIndex,
      legibility: rawExtraction.legibility,
      isUsable,
      legibilityScore: LEGIBILITY_SCORE_MAP[rawExtraction.legibility],
      photoIssueList: rawExtraction.photoIssueList,
    };
  });
  const usableList = validList.filter(({ extraction }) => isUsablePhoto(extraction));
  return {
    photoList,
    topicCandidateList: mergeTopicCandidateList(usableList, context),
    unsupportedTopicList: groupByPhoto(
      usableList,
      (extraction) => extraction.unsupportedTopicIdList,
      unsupportedTopicList.map((topic) => topic.unsupportedTopicId),
    ).map(({ value, photoIndexList }) => ({ unsupportedTopicId: value, photoIndexList })),
    sourceWarningList: groupByPhoto(
      validList,
      (extraction) => extraction.sourceWarningCodeList,
      sourceWarningCodeList,
    ).map(({ value, photoIndexList }) => ({ code: value, photoIndexList })),
    materialProfile: mergeMaterialProfile(usableList, context.subject),
    issueList,
  };
}

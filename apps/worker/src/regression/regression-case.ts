import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  countOrderTopics,
  err,
  findUnsupportedTopicList,
  gradeSchema,
  isSelectableTopic,
  legibilitySchema,
  MAX_PHOTO_COUNT,
  MAX_TOPIC_COUNT,
  MIN_TOPIC_COUNT,
  noteTextSchema,
  ok,
  otherTopicTextSchema,
  perceivedDifficultySchema,
  previewFailCodeSchema,
  type Result,
  sourceWarningCodeSchema,
  subjectSchema,
  taxonomyTopicIdSchema,
  uniqueListSchema,
  unsupportedTopicIdSchema,
  unsupportedTopicList,
} from "@gizito/core";
import { z } from "zod";

export const CASE_FILE_NAME = "case.json";
export const CASE_PHOTO_DIRECTORY_NAME = "photos";
export const MAX_CASE_NOTE_LENGTH = 300;

export const caseTagList = [
  "handwritten",
  "bad_photo",
  "fractions",
  "ambiguous_statement",
  "personal_data",
  "unsupported_topic",
  "only_unsupported",
  "other_topic",
  "figures",
  "grade_mismatch",
  "regression",
] as const;
export const caseTagSchema = z.enum(caseTagList);
export type CaseTag = z.infer<typeof caseTagSchema>;

export const expectedKitOutcomeList = ["ready", "failed", "not_applicable"] as const;
export const expectedKitOutcomeSchema = z.enum(expectedKitOutcomeList);
export type ExpectedKitOutcome = z.infer<typeof expectedKitOutcomeSchema>;

export const casePhotoSchema = z.strictObject({
  fileName: z.string().regex(/^[a-z0-9][a-z0-9-]*\.(?:png|jpe?g)$/),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  expectedLegibility: legibilitySchema,
});
export type CasePhoto = z.infer<typeof casePhotoSchema>;

export const expectedPreviewSchema = z.strictObject({
  outcome: z.enum(["preview_ready", "analysis_failed"]),
  failCode: previewFailCodeSchema.nullable(),
  requiredTopicIdList: uniqueListSchema(taxonomyTopicIdSchema),
  acceptableTopicIdList: uniqueListSchema(taxonomyTopicIdSchema),
  unsupportedTopicIdList: uniqueListSchema(unsupportedTopicIdSchema),
  requiredSourceWarningCodeList: uniqueListSchema(sourceWarningCodeSchema),
  acceptableFailCodeList: uniqueListSchema(previewFailCodeSchema).default([]),
});
export type ExpectedPreview = z.infer<typeof expectedPreviewSchema>;

export const caseConfirmationSchema = z.strictObject({
  topicIdList: uniqueListSchema(taxonomyTopicIdSchema),
  otherTopicText: otherTopicTextSchema.nullable(),
  perceivedDifficulty: perceivedDifficultySchema.nullable(),
  noteText: noteTextSchema.nullable(),
});
export type CaseConfirmation = z.infer<typeof caseConfirmationSchema>;

export const regressionCaseSchema = z.strictObject({
  caseId: z.string().regex(/^[4-7]-(?:math|portuguese)-[a-z0-9]+(?:-[a-z0-9]+)*$/),
  grade: gradeSchema,
  subject: subjectSchema,
  photoList: z.array(casePhotoSchema).min(1).max(MAX_PHOTO_COUNT),
  tagList: uniqueListSchema(caseTagSchema),
  expectedPreview: expectedPreviewSchema,
  confirmation: caseConfirmationSchema.nullable(),
  expectedKitOutcome: expectedKitOutcomeSchema,
  note: z.string().trim().min(1).max(MAX_CASE_NOTE_LENGTH),
});
export type RegressionCase = z.infer<typeof regressionCaseSchema>;

function unsupportedSubjectOf(unsupportedTopicId: string) {
  return unsupportedTopicList.find((topic) => topic.unsupportedTopicId === unsupportedTopicId)
    ?.subject;
}

export function findCaseProblemList(regressionCase: RegressionCase): readonly string[] {
  const { caseId, grade, subject, expectedPreview, confirmation } = regressionCase;
  const problemList: string[] = [];
  if (!caseId.startsWith(`${grade}-${subject}-`)) {
    problemList.push(`caseId não começa com ${grade}-${subject}-`);
  }
  const isPreviewReady = expectedPreview.outcome === "preview_ready";
  if (isPreviewReady !== (expectedPreview.failCode === null)) {
    problemList.push("failCode deve ser nulo só com a prévia preview_ready");
  }
  if (isPreviewReady === (regressionCase.expectedKitOutcome === "not_applicable")) {
    problemList.push("expectedKitOutcome é not_applicable só com a prévia analysis_failed");
  }
  const topicIdList = [
    ...expectedPreview.requiredTopicIdList,
    ...expectedPreview.acceptableTopicIdList,
    ...(confirmation?.topicIdList ?? []),
  ];
  for (const topicId of new Set(topicIdList)) {
    if (!isSelectableTopic(topicId, grade, subject)) {
      problemList.push(`${topicId} não é assunto do ${grade}º ano em ${subject}`);
    }
  }
  for (const topicId of expectedPreview.requiredTopicIdList) {
    if (expectedPreview.acceptableTopicIdList.includes(topicId)) {
      problemList.push(`${topicId} é obrigatório e aceitável ao mesmo tempo`);
    }
  }
  for (const unsupportedTopicId of expectedPreview.unsupportedTopicIdList) {
    if (unsupportedSubjectOf(unsupportedTopicId) !== subject) {
      problemList.push(`${unsupportedTopicId} não é área não atendida de ${subject}`);
    }
  }
  if (!isPreviewReady && expectedPreview.acceptableFailCodeList.length > 0) {
    problemList.push("recusa aceitável só com a prévia preview_ready");
  }
  if (!isPreviewReady && confirmation !== null) {
    problemList.push("prévia analysis_failed não tem confirmação");
  }
  if (isPreviewReady && confirmation === null && expectedPreview.requiredTopicIdList.length === 0) {
    problemList.push("prévia preview_ready sem confirmação pede ao menos um assunto obrigatório");
  }
  if (confirmation !== null) {
    const topicCount = countOrderTopics(confirmation.topicIdList, confirmation.otherTopicText);
    if (topicCount < MIN_TOPIC_COUNT || topicCount > MAX_TOPIC_COUNT) {
      problemList.push(
        `a confirmação soma ${topicCount} assuntos; o pedido aceita de ${MIN_TOPIC_COUNT} a ${MAX_TOPIC_COUNT}`,
      );
    }
    if (
      confirmation.otherTopicText !== null &&
      findUnsupportedTopicList(confirmation.otherTopicText, subject).length > 0
    ) {
      problemList.push("o outro da confirmação cai em área não atendida");
    }
  }
  return problemList;
}

export const materialPhraseFileSchema = z.strictObject({
  phraseListByCase: z.record(z.string(), uniqueListSchema(z.string().trim().min(3).max(80)).min(1)),
});

export async function loadMaterialPhraseMap(
  path: string,
): Promise<Result<Readonly<Record<string, readonly string[]>>, readonly string[]>> {
  const file = Bun.file(path);
  if (!(await file.exists())) return err([`${path} ausente`]);
  const parsed = materialPhraseFileSchema.safeParse(await file.json().catch(() => null));
  if (!parsed.success) {
    return err(
      parsed.error.issues.map((issue) => `${path}: ${issue.path.join(".")} ${issue.message}`),
    );
  }
  return ok(parsed.data.phraseListByCase);
}

export type LoadedRegressionCase = {
  readonly regressionCase: RegressionCase;
  readonly caseDirectory: string;
};

async function loadCase(
  casesDirectory: string,
  directoryName: string,
): Promise<Result<LoadedRegressionCase, readonly string[]>> {
  const caseDirectory = join(casesDirectory, directoryName);
  const file = Bun.file(join(caseDirectory, CASE_FILE_NAME));
  if (!(await file.exists())) return err([`${directoryName}: ${CASE_FILE_NAME} ausente`]);
  const parsed = regressionCaseSchema.safeParse(await file.json().catch(() => null));
  if (!parsed.success) {
    return err(
      parsed.error.issues.map(
        (issue) => `${directoryName}: ${issue.path.join(".") || "case.json"} ${issue.message}`,
      ),
    );
  }
  const problemList = [
    ...(parsed.data.caseId === directoryName ? [] : ["caseId diferente do nome do diretório"]),
    ...findCaseProblemList(parsed.data),
  ];
  if (problemList.length > 0)
    return err(problemList.map((problem) => `${directoryName}: ${problem}`));
  return ok({ regressionCase: parsed.data, caseDirectory });
}

export async function loadRegressionCaseList(
  casesDirectory: string,
): Promise<Result<readonly LoadedRegressionCase[], readonly string[]>> {
  const entryList = await readdir(casesDirectory, { withFileTypes: true });
  const directoryNameList = entryList
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const loadedList = await Promise.all(
    directoryNameList.map((directoryName) => loadCase(casesDirectory, directoryName)),
  );
  const errorList = loadedList.flatMap((loaded) => (loaded.ok ? [] : loaded.error));
  if (errorList.length > 0) return err(errorList);
  return ok(loadedList.flatMap((loaded) => (loaded.ok ? [loaded.value] : [])));
}

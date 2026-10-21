import {
  type AiFailureCode,
  type AiProvider,
  type AiStage,
  applyKitRepair,
  composeStudyKit,
  decideRepair,
  err,
  failReasonAfterRegeneration,
  type GenerationFailReasonCode,
  type Grade,
  interpretReview,
  isInvalidOutputAiFailureCode,
  isRetryableAiFailureCode,
  isSelectableTopic,
  type KitPlan,
  type KitSlotPlan,
  kitContentSchemaBySubject,
  kitPlanSchema,
  kitRepairSchemaBySubject,
  MAX_AI_COST_CENTS_PER_ORDER,
  MAX_REGENERATION_COUNT,
  type MaterialProfile,
  type MathEvaluator,
  materialProfileSchema,
  OTHER_TOPIC_REF,
  ok,
  type PerceivedDifficulty,
  planKitSlots,
  REVIEW_OUTPUT_RETRY_COUNT,
  type RepairDecision,
  type Result,
  reviewResultSchema,
  type SourceWarningCode,
  type StudyKit,
  type Subject,
  sourceWarningCodeSchema,
  studyKitSchema,
  type TopicRef,
  uniqueByCodeAndItem,
  type ValidationIssue,
  validateKitPlan,
  validateStudyKit,
} from "@gizito/core";
import type { z } from "zod";
import { type AiCallRecord, toAiCallRecord } from "#src/pipeline/ai-call.ts";
import { checkMathMarkup, type MathMarkupParser } from "#src/pipeline/math-markup.ts";
import { EXTRACT_PROMPT_VERSION } from "#src/pipeline/prompts/extract/v1.ts";
import {
  buildGeneratePrompt,
  buildGenerateRepairPrompt,
  GENERATE_PROMPT_VERSION,
} from "#src/pipeline/prompts/generate/v2.ts";
import {
  buildPlanPrompt,
  PLAN_PROMPT_VERSION,
  type Prompt,
} from "#src/pipeline/prompts/plan/v1.ts";
import {
  fullReviewScope,
  type ReviewScope,
  repairReviewScope,
} from "#src/pipeline/prompts/review/v1.ts";
import { buildReviewPrompt, REVIEW_PROMPT_VERSION } from "#src/pipeline/prompts/review/v2.ts";

export const GENERATION_VERSION = [
  EXTRACT_PROMPT_VERSION,
  PLAN_PROMPT_VERSION,
  GENERATE_PROMPT_VERSION,
  REVIEW_PROMPT_VERSION,
].join("+");

export type GenerationRequest = {
  readonly grade: Grade;
  readonly subject: Subject;
  readonly topicRefList: readonly TopicRef[];
  readonly perceivedDifficulty: PerceivedDifficulty | null;
  readonly noteText: string | null;
  readonly otherTopicText: string | null;
  readonly materialProfile: MaterialProfile;
  readonly sourceWarningCodeList: readonly SourceWarningCode[];
};

export type GenerationDependencies = {
  readonly aiProvider: AiProvider;
  readonly mathEvaluator: MathEvaluator;
  readonly isMathMarkupParsable: MathMarkupParser;
  readonly spentCostCents: number;
  readonly maxCostCents?: number;
  readonly onAiCall?: (record: AiCallRecord) => Promise<void> | void;
  readonly signal?: AbortSignal;
};

export const generationAttemptRepairList = ["initial", "plan", "kit", "item"] as const;
export type GenerationAttemptRepair = (typeof generationAttemptRepairList)[number];

export type GenerationAttempt = {
  readonly repair: GenerationAttemptRepair;
  readonly issueList: readonly ValidationIssue[];
};

export type GeneratedKit = {
  readonly studyKit: StudyKit;
  readonly attemptList: readonly GenerationAttempt[];
  readonly aiCallList: readonly AiCallRecord[];
};

export type GenerationFailureCode = GenerationFailReasonCode | AiFailureCode;

export type GenerationFailure = {
  readonly code: GenerationFailureCode;
  readonly isRetryable: boolean;
  readonly attemptList: readonly GenerationAttempt[];
  readonly aiCallList: readonly AiCallRecord[];
  readonly lastStudyKit: StudyKit | null;
};

type StepFailure = { readonly code: GenerationFailureCode; readonly isRetryable: boolean };

type RunContext = {
  readonly request: GenerationRequest;
  readonly dependencies: GenerationDependencies;
  readonly kitSlotPlan: KitSlotPlan;
  readonly aiCallList: AiCallRecord[];
};

type ReviewState = { readonly issueList: readonly ValidationIssue[] };

type RunState = {
  plan: KitPlan | null;
  studyKit: StudyKit | null;
  review: ReviewState | null;
};

type StepOutcome<T> =
  | { readonly kind: "ok"; readonly value: T }
  | {
      readonly kind: "blocked";
      readonly issueList: readonly ValidationIssue[];
      readonly studyKit: StudyKit | null;
    }
  | { readonly kind: "failed"; readonly failure: StepFailure };

type AttemptOutcome = StepOutcome<{
  readonly studyKit: StudyKit;
  readonly issueList: readonly ValidationIssue[];
}>;

type AiStepResult<T> =
  | { readonly kind: "output"; readonly output: T }
  | { readonly kind: "invalid_output" }
  | { readonly kind: "failed"; readonly failure: StepFailure };

function stepFailed(code: GenerationFailureCode, isRetryable: boolean) {
  return { kind: "failed", failure: { code, isRetryable } } as const;
}

function blocked(issueList: readonly ValidationIssue[], studyKit: StudyKit | null) {
  return { kind: "blocked", issueList, studyKit } as const;
}

function hasBlocker(issueList: readonly ValidationIssue[]): boolean {
  return issueList.some((issue) => issue.severity === "blocker");
}

function spentCostOf(context: RunContext): number {
  return (
    context.dependencies.spentCostCents +
    context.aiCallList.reduce((total, call) => total + call.costCents, 0)
  );
}

async function callAi<T>(
  context: RunContext,
  stage: Exclude<AiStage, "extract">,
  promptVersion: string,
  prompt: Prompt,
  outputSchema: z.ZodType<T>,
): Promise<AiStepResult<T>> {
  const { aiProvider, signal, onAiCall } = context.dependencies;
  if (signal?.aborted) return stepFailed("ai_aborted", true);
  if (spentCostOf(context) >= (context.dependencies.maxCostCents ?? MAX_AI_COST_CENTS_PER_ORDER)) {
    return stepFailed("ai_cost_exceeded", false);
  }
  const result = await aiProvider[stage]({
    promptVersion,
    systemPrompt: prompt.systemPrompt,
    userText: prompt.userText,
    outputSchema,
    signal,
  });
  const record = toAiCallRecord(stage, result);
  context.aiCallList.push(record);
  await onAiCall?.(record);
  if (result.ok) return { kind: "output", output: result.value.output };
  if (isInvalidOutputAiFailureCode(result.error.code)) return { kind: "invalid_output" };
  return stepFailed(result.error.code, isRetryableAiFailureCode(result.error.code));
}

function outputOf<T>(
  called: { readonly kind: "output"; readonly output: T } | { readonly kind: "invalid_output" },
) {
  return called.kind === "output" ? called.output : null;
}

async function planStep(context: RunContext): Promise<StepOutcome<KitPlan>> {
  const { request, kitSlotPlan } = context;
  const called = await callAi(
    context,
    "plan",
    PLAN_PROMPT_VERSION,
    buildPlanPrompt({ ...request, kitSlotPlan }),
    kitPlanSchema,
  );
  if (called.kind === "failed") return called;
  const validated = validateKitPlan(outputOf(called), kitSlotPlan, request.subject);
  return validated.ok ? { kind: "ok", value: validated.value } : blocked(validated.error, null);
}

function promptContextOf(context: RunContext, plan: KitPlan) {
  const { grade, subject, materialProfile } = context.request;
  return { grade, subject, materialProfile, kitSlotPlan: context.kitSlotPlan, plan };
}

function contentSchemaOf(subject: Subject): z.ZodType {
  return kitContentSchemaBySubject[subject];
}

function repairSchemaOf(subject: Subject): z.ZodType {
  return kitRepairSchemaBySubject[subject];
}

async function generateStep(context: RunContext, plan: KitPlan): Promise<StepOutcome<StudyKit>> {
  const { request, kitSlotPlan } = context;
  const called = await callAi(
    context,
    "generate",
    GENERATE_PROMPT_VERSION,
    buildGeneratePrompt(promptContextOf(context, plan)),
    contentSchemaOf(request.subject),
  );
  if (called.kind === "failed") return called;
  const composed = composeStudyKit({
    content: outputOf(called),
    kitSlotPlan,
    plan,
    grade: request.grade,
    subject: request.subject,
    perceivedDifficulty: request.perceivedDifficulty,
    materialProfile: request.materialProfile,
    sourceWarningCodeList: request.sourceWarningCodeList,
    generationVersion: GENERATION_VERSION,
  });
  return composed.ok ? { kind: "ok", value: composed.value } : blocked(composed.error, null);
}

type ItemRepairDecision = Extract<RepairDecision, { readonly repair: "item" }>;

async function repairStep(
  context: RunContext,
  plan: KitPlan,
  studyKit: StudyKit,
  decision: ItemRepairDecision,
): Promise<StepOutcome<StudyKit>> {
  const called = await callAi(
    context,
    "generate",
    GENERATE_PROMPT_VERSION,
    buildGenerateRepairPrompt({
      ...promptContextOf(context, plan),
      studyKit,
      itemIdList: decision.itemIdList,
      issueList: decision.issueList,
    }),
    repairSchemaOf(context.request.subject),
  );
  if (called.kind === "failed") return called;
  const repaired = applyKitRepair(studyKit, outputOf(called), decision.itemIdList);
  return repaired.ok ? { kind: "ok", value: repaired.value } : blocked(repaired.error, studyKit);
}

function validateKit(context: RunContext, studyKit: StudyKit): readonly ValidationIssue[] {
  const { mathEvaluator, isMathMarkupParsable } = context.dependencies;
  return uniqueByCodeAndItem([
    ...validateStudyKit(studyKit, { mathEvaluator }),
    ...checkMathMarkup(studyKit, isMathMarkupParsable),
  ]);
}

async function reviewStep(
  context: RunContext,
  plan: KitPlan,
  studyKit: StudyKit,
  scope: ReviewScope,
): Promise<StepOutcome<readonly ValidationIssue[]>> {
  const prompt = buildReviewPrompt({ ...promptContextOf(context, plan), studyKit, scope });
  for (let attempt = 0; attempt <= REVIEW_OUTPUT_RETRY_COUNT; attempt += 1) {
    const called = await callAi(
      context,
      "review",
      REVIEW_PROMPT_VERSION,
      prompt,
      reviewResultSchema,
    );
    if (called.kind === "failed") return called;
    if (called.kind === "output") {
      const interpreted = interpretReview(called.output, {
        studyKit,
        reviewedItemIdList: scope.reviewedItemIdList,
      });
      if (interpreted.ok) return { kind: "ok", value: interpreted.value };
    }
  }
  return stepFailed("ai_output_invalid", false);
}

async function checkAndReview(
  context: RunContext,
  state: RunState,
  plan: KitPlan,
  studyKit: StudyKit,
  repairedItemIdList: ItemRepairDecision["itemIdList"] | null,
): Promise<AttemptOutcome> {
  state.studyKit = studyKit;
  const validationIssueList = validateKit(context, studyKit);
  if (hasBlocker(validationIssueList)) return blocked(validationIssueList, studyKit);
  const partialReview =
    repairedItemIdList !== null && state.review !== null
      ? { itemIdList: repairedItemIdList, previous: state.review }
      : null;
  const scope =
    partialReview === null
      ? fullReviewScope(studyKit)
      : repairReviewScope(studyKit, partialReview.itemIdList);
  const reviewed = await reviewStep(context, plan, studyKit, scope);
  if (reviewed.kind !== "ok") return reviewed;
  const keptIssueList =
    partialReview === null
      ? []
      : partialReview.previous.issueList.filter(
          (issue) => issue.itemId === null || !partialReview.itemIdList.includes(issue.itemId),
        );
  const reviewIssueList = uniqueByCodeAndItem([...keptIssueList, ...reviewed.value]);
  state.review = { issueList: reviewIssueList };
  const issueList = [...validationIssueList, ...reviewIssueList];
  return hasBlocker(issueList)
    ? blocked(issueList, studyKit)
    : { kind: "ok", value: { studyKit, issueList } };
}

async function generateAndCheck(
  context: RunContext,
  state: RunState,
  plan: KitPlan,
): Promise<AttemptOutcome> {
  state.review = null;
  const generated = await generateStep(context, plan);
  if (generated.kind !== "ok") return generated;
  return checkAndReview(context, state, plan, generated.value, null);
}

type PendingRepair =
  | { readonly repair: "initial" }
  | Exclude<RepairDecision, { readonly repair: "none" }>;

async function runAttempt(
  context: RunContext,
  state: RunState,
  pending: PendingRepair,
): Promise<AttemptOutcome> {
  if (pending.repair === "initial" || pending.repair === "plan" || state.plan === null) {
    const planned = await planStep(context);
    if (planned.kind !== "ok") return planned;
    state.plan = planned.value;
  }
  const { plan } = state;
  if (pending.repair !== "item" || state.studyKit === null) {
    return generateAndCheck(context, state, plan);
  }
  const repaired = await repairStep(context, plan, state.studyKit, pending);
  if (repaired.kind !== "ok") return repaired;
  return checkAndReview(context, state, plan, repaired.value, pending.itemIdList);
}

function assertGenerationRequest(request: GenerationRequest): void {
  const { topicRefList, grade, subject } = request;
  const hasOtherTopic = topicRefList.includes(OTHER_TOPIC_REF);
  const isValid =
    topicRefList.every(
      (topicRef) => topicRef === OTHER_TOPIC_REF || isSelectableTopic(topicRef, grade, subject),
    ) &&
    (!hasOtherTopic || topicRefList.at(-1) === OTHER_TOPIC_REF) &&
    hasOtherTopic === (request.otherTopicText !== null) &&
    materialProfileSchema.safeParse(request.materialProfile).success &&
    request.sourceWarningCodeList.every((code) => sourceWarningCodeSchema.safeParse(code).success);
  if (!isValid) throw new RangeError("pedido de geração fora do contrato do generateKit");
}

function slotPlanOf(request: GenerationRequest): KitSlotPlan {
  const planned = planKitSlots(request.topicRefList, request.perceivedDifficulty);
  if (!planned.ok) throw new RangeError(planned.error.message);
  return planned.value;
}

export async function generateKit(
  request: GenerationRequest,
  dependencies: GenerationDependencies,
): Promise<Result<GeneratedKit, GenerationFailure>> {
  assertGenerationRequest(request);
  const context: RunContext = {
    request,
    dependencies,
    kitSlotPlan: slotPlanOf(request),
    aiCallList: [],
  };
  const state: RunState = { plan: null, studyKit: null, review: null };
  const attemptList: GenerationAttempt[] = [];
  const failWith = (code: GenerationFailureCode, isRetryable: boolean) =>
    err({
      code,
      isRetryable,
      attemptList,
      aiCallList: context.aiCallList,
      lastStudyKit: state.studyKit,
    });
  let pending: PendingRepair = { repair: "initial" };
  let regenerationLeft = MAX_REGENERATION_COUNT;
  for (;;) {
    const outcome = await runAttempt(context, state, pending);
    if (outcome.kind === "failed")
      return failWith(outcome.failure.code, outcome.failure.isRetryable);
    const issueList = outcome.kind === "ok" ? outcome.value.issueList : outcome.issueList;
    attemptList.push({ repair: pending.repair, issueList });
    if (outcome.kind === "ok") {
      const studyKit = studyKitSchema.parse({
        ...outcome.value.studyKit,
        qualityCheckList: issueList,
      });
      return ok({ studyKit, attemptList, aiCallList: context.aiCallList });
    }
    const decision = decideRepair(outcome.issueList, outcome.studyKit);
    if (decision === null) throw new Error("tentativa bloqueada sem bloqueador");
    if (decision.repair === "none") return failWith(decision.failReasonCode, false);
    if (regenerationLeft === 0) {
      return failWith(failReasonAfterRegeneration(outcome.issueList), false);
    }
    regenerationLeft -= 1;
    pending = decision;
  }
}

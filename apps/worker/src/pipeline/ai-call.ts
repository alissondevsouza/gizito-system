import type { AiCallResult, AiStage } from "@gizito/core";

export const AI_CALL_OK_OUTCOME_CODE = "ok";

export type AiCallRecord = {
  readonly stage: AiStage;
  readonly model: string;
  readonly promptVersion: string;
  readonly inputTokenCount: number;
  readonly outputTokenCount: number;
  readonly costCents: number;
  readonly durationMs: number;
  readonly outcomeCode: string;
};

export function toAiCallRecord<T>(stage: AiStage, result: AiCallResult<T>): AiCallRecord {
  const { usage, model, promptVersion, durationMs } = result.ok ? result.value : result.error;
  return {
    stage,
    model,
    promptVersion,
    inputTokenCount: usage?.inputTokens ?? 0,
    outputTokenCount: usage?.outputTokens ?? 0,
    costCents: usage?.costCents ?? 0,
    durationMs,
    outcomeCode: result.ok ? AI_CALL_OK_OUTCOME_CODE : result.error.code,
  };
}

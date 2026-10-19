import { type JobName, type JobPayload, jobErrorCodeMap, type OutcomeCode } from "@gizito/core";
import type { Transaction } from "#src/client.ts";

export type ExhaustedJob = {
  jobId: string;
  name: JobName;
  payload: JobPayload;
  attemptCount: number;
  errorCode: OutcomeCode;
};

export type ExhaustedJobHandler = (tx: Transaction, exhaustedJob: ExhaustedJob) => Promise<void>;

export class JobCompensationError extends Error {
  readonly code = jobErrorCodeMap.compensationFailed;

  constructor(
    readonly jobId: string,
    readonly jobName: JobName,
    options: { cause: unknown },
  ) {
    super(`Compensation of exhausted job ${jobId} failed`, options);
    this.name = "JobCompensationError";
  }
}

export async function compensateExhaustedJob(
  tx: Transaction,
  onExhausted: ExhaustedJobHandler,
  exhaustedJob: ExhaustedJob,
): Promise<void> {
  try {
    await onExhausted(tx, exhaustedJob);
  } catch (cause) {
    throw new JobCompensationError(exhaustedJob.jobId, exhaustedJob.name, { cause });
  }
}

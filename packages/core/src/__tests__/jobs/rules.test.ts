import { describe, expect, it } from "bun:test";
import { FIXED_NOW } from "#src/__tests__/__fixtures__/entities.ts";
import { outcomeCodeSchema } from "#src/common.ts";
import {
  JOB_LEASE_RENEW_INTERVAL_SECONDS,
  JOB_LOCK_TIMEOUT_SECONDS,
  JOB_MAX_ATTEMPT_COUNT,
  JOB_MAX_RUN_SECONDS,
  JOB_RETRY_DELAY_SECONDS_LIST,
} from "#src/constants.ts";
import { jobNameList } from "#src/enums.ts";
import {
  isPersonalDataJob,
  jobErrorCodeMap,
  jobLockExpireDatetime,
  jobRetryDelaySeconds,
  nextJobRunAfterDatetime,
  personalDataJobNameList,
  personalDataJobRetainedFieldMap,
} from "#src/jobs/rules.ts";
import { whatsappInboundJobPayloadSchema } from "#src/jobs/schemas.ts";

const secondsAfter = (seconds: number) => new Date(FIXED_NOW.getTime() + seconds * 1000);

describe("retry de jobs (jobs.md §4)", () => {
  it("quatro tentativas: a primeira e três retentativas com 30 s, 2 min e 8 min", () => {
    expect(JOB_RETRY_DELAY_SECONDS_LIST).toEqual([30, 120, 480]);
    expect(JOB_MAX_ATTEMPT_COUNT).toBe(4);
    expect([1, 2, 3, 4].map((attemptCount) => jobRetryDelaySeconds(attemptCount))).toEqual([
      30,
      120,
      480,
      null,
    ]);
  });

  it("nextJobRunAfterDatetime soma o atraso ao relógio recebido e devolve null quando esgota", () => {
    expect(nextJobRunAfterDatetime(1, FIXED_NOW)).toEqual(secondsAfter(30));
    expect(nextJobRunAfterDatetime(2, FIXED_NOW)).toEqual(secondsAfter(120));
    expect(nextJobRunAfterDatetime(3, FIXED_NOW)).toEqual(secondsAfter(480));
    expect(nextJobRunAfterDatetime(4, FIXED_NOW)).toBeNull();
  });

  it("respeita maxAttemptCount do job e repete o último atraso além da lista", () => {
    expect(jobRetryDelaySeconds(1, 1)).toBeNull();
    expect(jobRetryDelaySeconds(2, 2)).toBeNull();
    expect(jobRetryDelaySeconds(5, 8)).toBe(480);
    expect(nextJobRunAfterDatetime(6, FIXED_NOW, 8)).toEqual(secondsAfter(480));
  });

  it("tentativa abaixo de 1 usa o primeiro atraso", () => {
    expect(jobRetryDelaySeconds(0)).toBe(30);
  });
});

describe("lock de job", () => {
  it("expira 2 minutos depois do claim por padrão e aceita timeout próprio", () => {
    expect(JOB_LOCK_TIMEOUT_SECONDS).toBe(120);
    expect(jobLockExpireDatetime(FIXED_NOW)).toEqual(secondsAfter(120));
    expect(jobLockExpireDatetime(FIXED_NOW, 60)).toEqual(secondsAfter(60));
  });

  it("renova com folga antes de vencer e limita a execução a 15 minutos (ADR-0009)", () => {
    expect(JOB_LEASE_RENEW_INTERVAL_SECONDS * 3).toBeLessThanOrEqual(JOB_LOCK_TIMEOUT_SECONDS);
    expect(JOB_MAX_RUN_SECONDS).toBe(900);
    expect(JOB_MAX_RUN_SECONDS).toBeGreaterThan(JOB_LOCK_TIMEOUT_SECONDS);
  });
});

describe("payload com dado pessoal (invariante 9, LGPD)", () => {
  it("só whatsapp.inbound carrega dado pessoal", () => {
    expect(personalDataJobNameList).toEqual(["whatsapp.inbound"]);
    expect(jobNameList.filter(isPersonalDataJob)).toEqual(["whatsapp.inbound"]);
  });

  it("os campos mantidos ao terminar existem no payload e excluem telefone e texto", () => {
    const retainedFieldList: readonly string[] =
      personalDataJobRetainedFieldMap["whatsapp.inbound"];
    expect(retainedFieldList).toEqual(["name", "webhookEventId"]);
    expect(retainedFieldList).not.toContain("phone");
    expect(retainedFieldList).not.toContain("text");
    const shapeKeyList = Object.keys(whatsappInboundJobPayloadSchema.shape);
    for (const field of retainedFieldList) {
      expect(shapeKeyList).toContain(field);
    }
  });
});

describe("códigos de erro da fila", () => {
  it("são outcome codes válidos e estáveis (jobs.md §4)", () => {
    expect(Object.values(jobErrorCodeMap)).toEqual([
      "payload_invalid",
      "lock_expired",
      "unhandled_error",
      "handler_not_found",
      "job_timeout",
      "invalid_error_code",
      "worker_shutdown",
      "job_compensation_failed",
    ]);
    for (const code of Object.values(jobErrorCodeMap)) {
      expect(outcomeCodeSchema.safeParse(code).success).toBe(true);
    }
  });
});

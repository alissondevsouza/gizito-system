import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { err, type JobPayload, jobErrorCodeMap, ok } from "@gizito/core";
import { eq, sql } from "drizzle-orm";
import type { Transaction } from "#src/client.ts";
import {
  claimJob,
  type ExhaustedJob,
  enqueueJob,
  JobCompensationError,
  type JobHandler,
  recoverExpiredJobs,
  releaseJob,
  renewJobLease,
  type WorkJobOptions,
  workJob,
} from "#src/queue/index.ts";
import { job } from "#src/schema/index.ts";
import {
  createTestDatabase,
  type TestDatabase,
  truncateAllTables,
} from "#src/test-helpers/index.ts";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORDER_ID = "22222222-2222-4222-8222-222222222222";
const WORKER_ID = "worker-test";
const SHORT_LOCK_SECONDS = 0.3;
const FAST_RENEW_MS = 40;

let testDatabase: TestDatabase;

const generatePayload = (orderId: string = ORDER_ID): JobPayload => ({
  name: "order.generate",
  orderId,
});

async function loadJob(jobId: string) {
  const [row] = await testDatabase.db.select().from(job).where(eq(job.jobId, jobId));
  if (!row) throw new Error("job not found");
  return row;
}

async function countJobs(name: JobPayload["name"]) {
  const rowList = await testDatabase.db
    .select({ jobId: job.jobId })
    .from(job)
    .where(eq(job.name, name));
  return rowList.length;
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) =>
    signal.addEventListener("abort", () => resolve(), { once: true }),
  );
}

function work(options: Partial<WorkJobOptions> & Pick<WorkJobOptions, "handler">) {
  return workJob(testDatabase.db, {
    nameList: ["order.generate"],
    workerId: WORKER_ID,
    ...options,
  });
}

function past(seconds: number) {
  return new Date(Date.now() - seconds * 1000);
}

beforeAll(async () => {
  testDatabase = await createTestDatabase();
});

afterAll(async () => {
  await testDatabase.destroy();
});

beforeEach(async () => {
  await truncateAllTables(testDatabase.db);
});

describe("renewJobLease", () => {
  it("estende o lock do lease ativo e devolve false depois que outro worker reclama o job", async () => {
    const enqueued = await enqueueJob(testDatabase.db, generatePayload(), {
      runAfterDatetime: past(1),
    });
    const now = new Date();
    const claimed = await claimJob(testDatabase.db, {
      nameList: ["order.generate"],
      workerId: "w1",
      now,
      lockTimeoutSeconds: 60,
    });
    if (!claimed) throw new Error("claim returned null");
    const renewedAt = new Date(now.getTime() + 30_000);
    expect(await renewJobLease(testDatabase.db, claimed, { now: renewedAt })).toBe(true);
    const expected = new Date(renewedAt.getTime() + 120_000);
    expect((await loadJob(enqueued.jobId)).lockExpireDatetime).toEqual(expected);
    await recoverExpiredJobs(testDatabase.db, { now: new Date(expected.getTime() + 1) });
    const reclaimed = await claimJob(testDatabase.db, {
      nameList: ["order.generate"],
      workerId: "w2",
      now: new Date(expected.getTime() + 1),
    });
    expect(reclaimed?.attemptCount).toBe(2);
    expect(await renewJobLease(testDatabase.db, claimed)).toBe(false);
  });
});

describe("releaseJob", () => {
  it("devolve o job à fila sem consumir tentativa", async () => {
    const enqueued = await enqueueJob(testDatabase.db, generatePayload(), {
      runAfterDatetime: past(1),
    });
    const claimed = await claimJob(testDatabase.db, {
      nameList: ["order.generate"],
      workerId: "w1",
    });
    if (!claimed) throw new Error("claim returned null");
    expect(await releaseJob(testDatabase.db, claimed)).toBe(true);
    const row = await loadJob(enqueued.jobId);
    expect(row).toMatchObject({
      status: "pending",
      attemptCount: 0,
      lockedBy: null,
      lockExpireDatetime: null,
      lastErrorCode: jobErrorCodeMap.workerShutdown,
    });
    const reclaimed = await claimJob(testDatabase.db, {
      nameList: ["order.generate"],
      workerId: "w2",
    });
    expect(reclaimed?.attemptCount).toBe(1);
    expect(await releaseJob(testDatabase.db, claimed)).toBe(true);
    expect(await releaseJob(testDatabase.db, { ...claimed, attemptCount: 9 })).toBe(false);
  });
});

describe("workJob com lease renovado", () => {
  it("renova o lock enquanto o handler roda, e a varredura não devolve o job", async () => {
    const enqueued = await enqueueJob(testDatabase.db, generatePayload(), {
      runAfterDatetime: past(1),
    });
    let recoveredDuringRun = -1;
    const outcome = await work({
      lockTimeoutSeconds: SHORT_LOCK_SECONDS,
      leaseRenewIntervalMs: FAST_RENEW_MS,
      handler: async () => {
        await Bun.sleep(SHORT_LOCK_SECONDS * 1000 * 2.5);
        const { requeuedCount, failedCount } = await recoverExpiredJobs(testDatabase.db);
        recoveredDuringRun = requeuedCount + failedCount;
        return ok(null);
      },
    });
    expect(recoveredDuringRun).toBe(0);
    expect(outcome).toMatchObject({ outcome: "completed", jobId: enqueued.jobId });
  });

  it("lease perdido aborta o handler e a tentativa termina lease_lost", async () => {
    const enqueued = await enqueueJob(testDatabase.db, generatePayload(), {
      runAfterDatetime: past(1),
    });
    let abortReason: unknown;
    const handler: JobHandler = async (_claimedJob, { signal }) => {
      await recoverExpiredJobs(testDatabase.db, { now: new Date(Date.now() + 3_600_000) });
      await waitForAbort(signal);
      abortReason = signal.reason;
      return err({ errorCode: "provider_unavailable", retryable: true });
    };
    const outcome = await work({ leaseRenewIntervalMs: FAST_RENEW_MS, handler });
    expect(abortReason).toBe("lease_lost");
    expect(outcome.outcome).toBe("lease_lost");
    expect((await loadJob(enqueued.jobId)).status).toBe("pending");
  });

  it("erro de banco na renovação vai para onLeaseRenewError sem abortar o handler", async () => {
    await enqueueJob(testDatabase.db, generatePayload(), { runAfterDatetime: past(1) });
    await testDatabase.db.execute(sql`
      CREATE FUNCTION refuse_lease_renewal() RETURNS trigger LANGUAGE plpgsql
      AS $$ BEGIN RAISE EXCEPTION 'lease renewal refused'; END $$`);
    await testDatabase.db.execute(sql`
      CREATE TRIGGER refuse_lease_renewal BEFORE UPDATE ON job FOR EACH ROW
      WHEN (OLD.status = 'active' AND NEW.status = 'active')
      EXECUTE FUNCTION refuse_lease_renewal()`);
    const renewErrorList: unknown[] = [];
    let abortedDuringRun = true;
    try {
      const outcome = await work({
        leaseRenewIntervalMs: FAST_RENEW_MS,
        onLeaseRenewError: (error) => renewErrorList.push(error),
        handler: async (_claimedJob, { signal }) => {
          await Bun.sleep(FAST_RENEW_MS * 4);
          abortedDuringRun = signal.aborted;
          return ok(null);
        },
      });
      expect(outcome.outcome).toBe("completed");
    } finally {
      await testDatabase.db.execute(sql`DROP TRIGGER refuse_lease_renewal ON job`);
      await testDatabase.db.execute(sql`DROP FUNCTION refuse_lease_renewal()`);
    }
    expect(abortedDuringRun).toBe(false);
    expect(renewErrorList.length).toBeGreaterThan(0);
  });

  it("passado o tempo máximo, aborta o handler e reagenda com job_timeout", async () => {
    const enqueued = await enqueueJob(testDatabase.db, generatePayload(), {
      runAfterDatetime: past(1),
    });
    let abortReason: unknown;
    const outcome = await work({
      maxRunMs: 50,
      handler: async (_claimedJob, { signal }) => {
        await waitForAbort(signal);
        abortReason = signal.reason;
        return err({ errorCode: "provider_unavailable", retryable: true });
      },
    });
    expect(abortReason).toBe("timeout");
    expect(outcome).toMatchObject({
      outcome: "retry_scheduled",
      errorCode: jobErrorCodeMap.jobTimeout,
    });
    expect((await loadJob(enqueued.jobId)).lastErrorCode).toBe(jobErrorCodeMap.jobTimeout);
  });

  it("falha definitiva do handler vence o tempo máximo", async () => {
    await enqueueJob(testDatabase.db, generatePayload(), { runAfterDatetime: past(1) });
    const outcome = await work({
      maxRunMs: 50,
      handler: async (_claimedJob, { signal }) => {
        await waitForAbort(signal);
        return err({ errorCode: "generation_blocked", retryable: false });
      },
    });
    expect(outcome).toMatchObject({ outcome: "failed", errorCode: "generation_blocked" });
  });
});

describe("workJob no desligamento", () => {
  it("aborta o handler, libera o job sem gastar tentativa e não renova depois de liberar", async () => {
    const enqueued = await enqueueJob(testDatabase.db, generatePayload(), {
      runAfterDatetime: past(1),
    });
    const shutdown = new AbortController();
    let abortReason: unknown;
    const outcome = await work({
      signal: shutdown.signal,
      leaseRenewIntervalMs: FAST_RENEW_MS,
      handler: async (_claimedJob, { signal }) => {
        setTimeout(() => shutdown.abort(), FAST_RENEW_MS * 2);
        await waitForAbort(signal);
        abortReason = signal.reason;
        throw new Error("aborted by shutdown");
      },
    });
    expect(abortReason).toBe("shutdown");
    expect(outcome).toMatchObject({
      outcome: "released",
      attemptCount: 1,
      errorCode: jobErrorCodeMap.workerShutdown,
    });
    expect(await loadJob(enqueued.jobId)).toMatchObject({ status: "pending", attemptCount: 0 });
    const reclaimed = await claimJob(testDatabase.db, {
      nameList: ["order.generate"],
      workerId: "w2",
      lockTimeoutSeconds: 60,
    });
    expect(reclaimed?.attemptCount).toBe(1);
    const reclaimedRow = await loadJob(enqueued.jobId);
    await Bun.sleep(FAST_RENEW_MS * 4);
    expect((await loadJob(enqueued.jobId)).lockExpireDatetime).toEqual(
      reclaimedRow.lockExpireDatetime,
    );
  });

  it("handler que termina ok apesar do desligamento conclui o job", async () => {
    await enqueueJob(testDatabase.db, generatePayload(), { runAfterDatetime: past(1) });
    const shutdown = new AbortController();
    shutdown.abort();
    const outcome = await work({ signal: shutdown.signal, handler: async () => ok(null) });
    expect(outcome.outcome).toBe("completed");
  });

  it("falha definitiva durante o desligamento vira failed, não released", async () => {
    await enqueueJob(testDatabase.db, generatePayload(), { runAfterDatetime: past(1) });
    const shutdown = new AbortController();
    shutdown.abort();
    const outcome = await work({
      signal: shutdown.signal,
      handler: async () => err({ errorCode: "generation_blocked", retryable: false }),
    });
    expect(outcome).toMatchObject({ outcome: "failed", errorCode: "generation_blocked" });
  });
});

describe("workJob com código de erro inválido", () => {
  it("troca o código por invalid_error_code e reagenda sem deixar o job ativo", async () => {
    const enqueued = await enqueueJob(testDatabase.db, generatePayload(), {
      runAfterDatetime: past(1),
    });
    const outcome = await work({
      handler: async () => err({ errorCode: "AI-Timeout: mae@example.com", retryable: true }),
    });
    expect(outcome).toMatchObject({
      outcome: "retry_scheduled",
      errorCode: jobErrorCodeMap.invalidErrorCode,
    });
    const row = await loadJob(enqueued.jobId);
    expect(row.status).toBe("pending");
    expect(row.lastErrorCode).toBe(jobErrorCodeMap.invalidErrorCode);
  });

  it("mantém a falha definitiva quando o código inválido vem com retryable false", async () => {
    await enqueueJob(testDatabase.db, generatePayload(), { runAfterDatetime: past(1) });
    const outcome = await work({
      handler: async () => err({ errorCode: "Generation Blocked", retryable: false }),
    });
    expect(outcome).toMatchObject({
      outcome: "failed",
      errorCode: jobErrorCodeMap.invalidErrorCode,
    });
  });
});

describe("esgotamento com compensação", () => {
  const notifyFailed = async (tx: Transaction, exhaustedJob: ExhaustedJob) => {
    if (exhaustedJob.payload.name !== "order.generate") return;
    await enqueueJob(tx, {
      name: "order.notify",
      orderId: exhaustedJob.payload.orderId,
      kind: "kit_failed",
    });
  };

  it("chama onExhausted uma vez, na transação do failed, só quando a falha transitória esgota", async () => {
    const enqueued = await enqueueJob(testDatabase.db, generatePayload(), {
      runAfterDatetime: past(1),
      maxAttemptCount: 2,
    });
    const exhaustedList: ExhaustedJob[] = [];
    const onExhausted: WorkJobOptions["onExhausted"] = async (tx, exhaustedJob) => {
      exhaustedList.push(exhaustedJob);
      await notifyFailed(tx, exhaustedJob);
    };
    const failing: JobHandler = async () =>
      err({ errorCode: "provider_unavailable", retryable: true });
    expect((await work({ handler: failing, onExhausted })).outcome).toBe("retry_scheduled");
    expect(exhaustedList).toEqual([]);
    await testDatabase.db
      .update(job)
      .set({ runAfterDatetime: past(1) })
      .where(eq(job.jobId, enqueued.jobId));
    expect((await work({ handler: failing, onExhausted })).outcome).toBe("failed");
    expect(exhaustedList).toEqual([
      {
        jobId: enqueued.jobId,
        name: "order.generate",
        payload: generatePayload(),
        attemptCount: 2,
        errorCode: "provider_unavailable",
      },
    ]);
    expect(await countJobs("order.notify")).toBe(1);
  });

  it("não chama onExhausted em falha definitiva do handler", async () => {
    await enqueueJob(testDatabase.db, generatePayload(), { runAfterDatetime: past(1) });
    let called = false;
    const outcome = await work({
      handler: async () => err({ errorCode: "generation_blocked", retryable: false }),
      onExhausted: async () => {
        called = true;
      },
    });
    expect(outcome.outcome).toBe("failed");
    expect(called).toBe(false);
  });

  it("onExhausted que lança desfaz o failed e a escrita do callback; o job fica ativo", async () => {
    const enqueued = await enqueueJob(testDatabase.db, generatePayload(), {
      runAfterDatetime: past(1),
      maxAttemptCount: 1,
    });
    const outcome = work({
      handler: async () => {
        throw new Error("provider exploded");
      },
      onExhausted: async (tx, exhaustedJob) => {
        await notifyFailed(tx, exhaustedJob);
        throw new Error("database went away");
      },
    });
    await expect(outcome).rejects.toBeInstanceOf(JobCompensationError);
    const row = await loadJob(enqueued.jobId);
    expect(row.status).toBe("active");
    expect(row.finishDatetime).toBeNull();
    expect(await countJobs("order.notify")).toBe(0);
  });

  it("varredura compensa o job esgotado por lock vencido com lock_expired", async () => {
    const enqueued = await enqueueJob(testDatabase.db, generatePayload(), {
      runAfterDatetime: past(1),
      maxAttemptCount: 1,
    });
    await claimJob(testDatabase.db, {
      nameList: ["order.generate"],
      workerId: "dead-worker",
      lockTimeoutSeconds: 1,
    });
    const exhaustedList: ExhaustedJob[] = [];
    const result = await recoverExpiredJobs(testDatabase.db, {
      now: new Date(Date.now() + 5_000),
      onExhausted: async (tx, exhaustedJob) => {
        exhaustedList.push(exhaustedJob);
        await notifyFailed(tx, exhaustedJob);
      },
    });
    expect(result).toEqual({ requeuedCount: 0, failedCount: 1, compensationFailureList: [] });
    expect(exhaustedList).toMatchObject([
      { jobId: enqueued.jobId, attemptCount: 1, errorCode: jobErrorCodeMap.lockExpired },
    ]);
    expect((await loadJob(enqueued.jobId)).status).toBe("failed");
    expect(await countJobs("order.notify")).toBe(1);
  });

  it("compensação que sempre lança não trava a devolução nem a compensação dos outros", async () => {
    const poison = await enqueueJob(testDatabase.db, generatePayload(ORDER_ID), {
      runAfterDatetime: past(3),
      maxAttemptCount: 1,
    });
    const exhausted = await enqueueJob(testDatabase.db, generatePayload(OTHER_ORDER_ID), {
      runAfterDatetime: past(2),
      maxAttemptCount: 1,
    });
    const retryable = await enqueueJob(testDatabase.db, generatePayload(OTHER_ORDER_ID), {
      runAfterDatetime: past(1),
    });
    for (let index = 0; index < 3; index += 1) {
      await claimJob(testDatabase.db, {
        nameList: ["order.generate"],
        workerId: "dead-worker",
        lockTimeoutSeconds: 1,
      });
    }
    const compensatedList: string[] = [];
    const result = await recoverExpiredJobs(testDatabase.db, {
      now: new Date(Date.now() + 5_000),
      onExhausted: async (tx, exhaustedJob) => {
        if (exhaustedJob.jobId === poison.jobId) throw new Error("always fails");
        compensatedList.push(exhaustedJob.jobId);
        await notifyFailed(tx, exhaustedJob);
      },
    });
    expect(result.requeuedCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.compensationFailureList).toMatchObject([
      { jobId: poison.jobId, name: "order.generate" },
    ]);
    expect(compensatedList).toEqual([exhausted.jobId]);
    expect((await loadJob(poison.jobId)).status).toBe("active");
    expect((await loadJob(exhausted.jobId)).status).toBe("failed");
    expect((await loadJob(retryable.jobId)).status).toBe("pending");
    expect(await countJobs("order.notify")).toBe(1);
  });

  it("varredura sem payload válido falha o job com payload_invalid sem chamar onExhausted", async () => {
    const enqueued = await enqueueJob(testDatabase.db, generatePayload(), {
      runAfterDatetime: past(1),
      maxAttemptCount: 1,
    });
    await claimJob(testDatabase.db, {
      nameList: ["order.generate"],
      workerId: "dead-worker",
      lockTimeoutSeconds: 1,
    });
    await testDatabase.db
      .update(job)
      .set({ payload: { name: "order.generate", orderId: "not-a-uuid" } })
      .where(eq(job.jobId, enqueued.jobId));
    let called = false;
    const result = await recoverExpiredJobs(testDatabase.db, {
      now: new Date(Date.now() + 5_000),
      onExhausted: async () => {
        called = true;
      },
    });
    expect(result.failedCount).toBe(1);
    expect(called).toBe(false);
    expect((await loadJob(enqueued.jobId)).lastErrorCode).toBe(jobErrorCodeMap.payloadInvalid);
  });
});

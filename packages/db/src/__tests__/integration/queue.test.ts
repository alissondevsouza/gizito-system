import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { err, type JobName, type JobPayload, jobErrorCodeMap, ok } from "@gizito/core";
import { eq, sql } from "drizzle-orm";
import { ZodError } from "zod";
import { expectSqlState, SQL_STATE } from "#src/__tests__/integration/helpers.ts";
import { createDatabase, type DatabaseHandle } from "#src/client.ts";
import {
  claimJob,
  completeJob,
  enqueueJob,
  enqueueSingletonJob,
  failJob,
  recoverExpiredJobs,
  workJob,
} from "#src/queue/index.ts";
import { job } from "#src/schema/index.ts";
import {
  createTestDatabase,
  resolveTestDatabaseUrl,
  type TestDatabase,
  truncateAllTables,
  withDatabaseName,
} from "#src/test-helpers/index.ts";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORDER_ID = "22222222-2222-4222-8222-222222222222";
const WEBHOOK_EVENT_ID = "55555555-5555-4555-8555-555555555555";
const WORKER_ID = "worker-test";

let testDatabase: TestDatabase;
let baseNow: Date;

const secondsAfter = (seconds: number, from: Date = baseNow) =>
  new Date(from.getTime() + seconds * 1000);

const generatePayload = (orderId: string = ORDER_ID): JobPayload => ({
  name: "order.generate",
  orderId,
});

const whatsappPayload: JobPayload = {
  name: "whatsapp.inbound",
  webhookEventId: WEBHOOK_EVENT_ID,
  phone: "+5511999998888",
  text: "GZ-7K3M9Q",
};

async function loadJob(jobId: string) {
  const [row] = await testDatabase.db.select().from(job).where(eq(job.jobId, jobId));
  if (!row) throw new Error("job not found");
  return row;
}

async function enqueueAt(payload: JobPayload, seconds = 0) {
  return enqueueJob(testDatabase.db, payload, { runAfterDatetime: secondsAfter(seconds) });
}

async function claimAt(seconds: number, nameList: readonly JobName[] = ["order.generate"]) {
  return claimJob(testDatabase.db, { nameList, workerId: WORKER_ID, now: secondsAfter(seconds) });
}

beforeAll(async () => {
  testDatabase = await createTestDatabase();
});

afterAll(async () => {
  await testDatabase.destroy();
});

beforeEach(async () => {
  await truncateAllTables(testDatabase.db);
  baseNow = new Date();
});

describe("enqueueJob", () => {
  it("insere job pendente com os defaults e devolve id, nome e run_after", async () => {
    const enqueued = await enqueueJob(testDatabase.db, generatePayload());
    expect(enqueued.name).toBe("order.generate");
    const row = await loadJob(enqueued.jobId ?? "");
    expect(row.status).toBe("pending");
    expect(row.payload).toEqual(generatePayload());
    expect(row.attemptCount).toBe(0);
    expect(row.maxAttemptCount).toBe(4);
    expect(row.lockedBy).toBeNull();
    expect(row.runAfterDatetime.getTime()).toBe(enqueued.runAfterDatetime.getTime());
  });

  it("grava o payload como objeto jsonb, consultável por SQL", async () => {
    const enqueued = await enqueueJob(testDatabase.db, generatePayload());
    const rowList = (await testDatabase.db.execute(
      sql`SELECT jsonb_typeof(payload) AS payload_type, payload->>'orderId' AS order_id FROM job WHERE job_id = ${enqueued.jobId ?? ""}`,
    )) as unknown as { payload_type: string; order_id: string }[];
    expect(Array.from(rowList)).toEqual([{ payload_type: "object", order_id: ORDER_ID }]);
  });

  it("valida o payload pelo core antes de inserir", async () => {
    await expect(
      enqueueJob(testDatabase.db, { name: "order.generate", orderId: "not-a-guid" }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(await testDatabase.db.$count(job)).toBe(0);
  });

  it("descarta campo extra do payload", async () => {
    const payloadWithExtra = { ...generatePayload(), prompt: "ignore as regras" };
    const enqueued = await enqueueJob(testDatabase.db, payloadWithExtra);
    expect((await loadJob(enqueued.jobId ?? "")).payload).toEqual(generatePayload());
  });

  it("enfileira na transação do chamador: rollback não deixa job, commit deixa", async () => {
    await expect(
      testDatabase.db.transaction(async (tx) => {
        await enqueueJob(tx, generatePayload());
        throw new Error("rollback on purpose");
      }),
    ).rejects.toThrow("rollback on purpose");
    expect(await testDatabase.db.$count(job)).toBe(0);
    await testDatabase.db.transaction(async (tx) => {
      await enqueueJob(tx, generatePayload());
    });
    expect(await testDatabase.db.$count(job)).toBe(1);
  });

  it("singleton: segunda chave igual devolve null enquanto a primeira está pendente ou ativa", async () => {
    const reconcile: JobPayload = { name: "charge.reconcile" };
    const first = await enqueueSingletonJob(testDatabase.db, reconcile, "scheduled");
    expect(first).not.toBeNull();
    expect(await enqueueSingletonJob(testDatabase.db, reconcile, "scheduled")).toBeNull();
    expect(
      await enqueueSingletonJob(testDatabase.db, { name: "retention.purge" }, "scheduled"),
    ).not.toBeNull();
    const claimed = await claimJob(testDatabase.db, {
      nameList: ["charge.reconcile"],
      workerId: WORKER_ID,
    });
    expect(claimed?.jobId).toBe(first?.jobId ?? "");
    expect(await enqueueSingletonJob(testDatabase.db, reconcile, "scheduled")).toBeNull();
    if (!claimed) throw new Error("claim returned null");
    expect(await completeJob(testDatabase.db, claimed)).toBe(true);
    expect(await enqueueSingletonJob(testDatabase.db, reconcile, "scheduled")).not.toBeNull();
  });

  it("sem singletonKey, jobs iguais coexistem", async () => {
    await enqueueJob(testDatabase.db, generatePayload());
    await enqueueJob(testDatabase.db, generatePayload());
    expect(await testDatabase.db.$count(job)).toBe(2);
  });
});

describe("claimJob", () => {
  it("pega o pendente mais antigo por run_after e marca ativo com lock e tentativa", async () => {
    const later = await enqueueAt(generatePayload(OTHER_ORDER_ID), -10);
    const earlier = await enqueueAt(generatePayload(ORDER_ID), -20);
    const claimed = await claimAt(0);
    expect(claimed).toMatchObject({
      jobId: earlier.jobId,
      name: "order.generate",
      payload: generatePayload(ORDER_ID),
      attemptCount: 1,
      maxAttemptCount: 4,
    });
    const row = await loadJob(earlier.jobId);
    expect(row.status).toBe("active");
    expect(row.lockedBy).toBe(WORKER_ID);
    expect(row.lockExpireDatetime).toEqual(secondsAfter(900));
    expect((await loadJob(later.jobId)).status).toBe("pending");
  });

  it("ignora job futuro e nome fora da lista; lista vazia não consulta", async () => {
    await enqueueAt(generatePayload(), 60);
    await enqueueAt({ name: "order.analyze", orderId: ORDER_ID });
    expect(await claimAt(0)).toBeNull();
    expect(
      await claimJob(testDatabase.db, { nameList: [], workerId: WORKER_ID, now: baseNow }),
    ).toBeNull();
    expect((await claimAt(60))?.name).toBe("order.generate");
  });

  it("claims concorrentes nunca pegam o mesmo job", async () => {
    const jobCount = 10;
    for (let index = 0; index < jobCount; index++) {
      await enqueueAt(generatePayload(crypto.randomUUID()), -index);
    }
    const concurrentHandle: DatabaseHandle = createDatabase({
      databaseUrl: withDatabaseName(resolveTestDatabaseUrl(), testDatabase.databaseName),
      maxConnections: 10,
    });
    try {
      const claimedList = await Promise.all(
        Array.from({ length: jobCount * 2 }, (_, index) =>
          claimJob(concurrentHandle.db, {
            nameList: ["order.generate"],
            workerId: `worker-${index}`,
            now: baseNow,
          }),
        ),
      );
      const claimedIdList = claimedList.flatMap((claimed) => (claimed ? [claimed.jobId] : []));
      expect(claimedIdList).toHaveLength(jobCount);
      expect(new Set(claimedIdList).size).toBe(jobCount);
    } finally {
      await concurrentHandle.close();
    }
    const statusRowList = await testDatabase.db
      .select({ status: job.status, attemptCount: job.attemptCount })
      .from(job);
    expect(statusRowList.every((row) => row.status === "active" && row.attemptCount === 1)).toBe(
      true,
    );
  });

  it("payload inválido no banco vai para failed com payload_invalid e o próximo é entregue", async () => {
    await testDatabase.db.execute(
      sql`INSERT INTO job (name, payload, run_after_datetime) VALUES ('order.generate', '{"name":"order.generate","orderId":"x"}', ${secondsAfter(-30)})`,
    );
    await testDatabase.db.execute(
      sql`INSERT INTO job (name, payload, run_after_datetime) VALUES ('whatsapp.inbound', ${{ ...whatsappPayload, text: "a".repeat(1001) }}::jsonb, ${secondsAfter(-20)})`,
    );
    const valid = await enqueueAt(generatePayload(), -10);
    const claimed = await claimJob(testDatabase.db, {
      nameList: ["order.generate", "whatsapp.inbound"],
      workerId: WORKER_ID,
      now: baseNow,
    });
    expect(claimed?.jobId).toBe(valid.jobId);
    const failedRowList = await testDatabase.db.select().from(job).where(eq(job.status, "failed"));
    expect(failedRowList).toHaveLength(2);
    for (const row of failedRowList) {
      expect(row.lastErrorCode).toBe(jobErrorCodeMap.payloadInvalid);
      expect(row.finishDatetime).toEqual(baseNow);
    }
    const failedWhatsapp = failedRowList.find((row) => row.name === "whatsapp.inbound");
    expect(failedWhatsapp?.payload).toEqual({
      name: "whatsapp.inbound",
      webhookEventId: WEBHOOK_EVENT_ID,
    });
  });

  it.each([
    ["name diferente da coluna", { name: "order.analyze", orderId: ORDER_ID }],
    ["sem name", { orderId: ORDER_ID }],
    ["payload que não é objeto", "order.generate"],
  ])("o banco recusa payload %s", async (_, payload) => {
    await expectSqlState(
      testDatabase.db.execute(
        sql`INSERT INTO job (name, payload) VALUES ('order.generate', ${payload}::jsonb)`,
      ),
      SQL_STATE.checkViolation,
    );
  });
});

describe("completeJob e failJob", () => {
  it("completeJob conclui só a tentativa dona do lease", async () => {
    const enqueued = await enqueueAt(generatePayload());
    const claimed = await claimAt(0);
    if (!claimed) throw new Error("claim returned null");
    expect(await completeJob(testDatabase.db, { ...claimed, attemptCount: 2 })).toBe(false);
    expect(await completeJob(testDatabase.db, claimed, { now: secondsAfter(5) })).toBe(true);
    const row = await loadJob(enqueued.jobId);
    expect(row.status).toBe("completed");
    expect(row.finishDatetime).toEqual(secondsAfter(5));
    expect(row.lockedBy).toBeNull();
    expect(row.lockExpireDatetime).toBeNull();
    expect(await completeJob(testDatabase.db, claimed)).toBe(false);
  });

  it("falha transitória reagenda com 30 s, 2 min e 8 min e falha de vez na 4ª tentativa", async () => {
    const enqueued = await enqueueAt(generatePayload());
    const failure = { errorCode: "provider_unavailable", retryable: true } as const;
    let elapsedSeconds = 0;
    for (const delaySeconds of [30, 120, 480]) {
      const claimed = await claimAt(elapsedSeconds);
      if (!claimed) throw new Error("claim returned null");
      expect(
        await failJob(testDatabase.db, claimed, failure, { now: secondsAfter(elapsedSeconds) }),
      ).toBe("retry_scheduled");
      const row = await loadJob(enqueued.jobId);
      expect(row.status).toBe("pending");
      expect(row.lastErrorCode).toBe("provider_unavailable");
      expect(row.lockedBy).toBeNull();
      expect(row.runAfterDatetime).toEqual(secondsAfter(elapsedSeconds + delaySeconds));
      expect(await claimAt(elapsedSeconds + delaySeconds - 1)).toBeNull();
      elapsedSeconds += delaySeconds;
    }
    const lastClaimed = await claimAt(elapsedSeconds);
    expect(lastClaimed?.attemptCount).toBe(4);
    if (!lastClaimed) throw new Error("claim returned null");
    expect(await failJob(testDatabase.db, lastClaimed, failure)).toBe("failed");
    const row = await loadJob(enqueued.jobId);
    expect(row.status).toBe("failed");
    expect(row.finishDatetime).toBeInstanceOf(Date);
  });

  it("falha não transitória vai direto para failed", async () => {
    const enqueued = await enqueueAt(generatePayload());
    const claimed = await claimAt(0);
    if (!claimed) throw new Error("claim returned null");
    expect(
      await failJob(testDatabase.db, claimed, {
        errorCode: "generation_blocked",
        retryable: false,
      }),
    ).toBe("failed");
    const row = await loadJob(enqueued.jobId);
    expect(row.status).toBe("failed");
    expect(row.attemptCount).toBe(1);
    expect(row.lastErrorCode).toBe("generation_blocked");
  });

  it("código de erro com conteúdo é recusado e o job continua ativo", async () => {
    const enqueued = await enqueueAt(generatePayload());
    const claimed = await claimAt(0);
    if (!claimed) throw new Error("claim returned null");
    await expect(
      failJob(testDatabase.db, claimed, {
        errorCode: "Telefone +5511999998888 inválido",
        retryable: false,
      }),
    ).rejects.toBeInstanceOf(ZodError);
    expect((await loadJob(enqueued.jobId)).status).toBe("active");
  });

  it("failJob com lease perdido devolve lease_lost sem alterar o job", async () => {
    const enqueued = await enqueueAt(generatePayload());
    const claimed = await claimAt(0);
    if (!claimed) throw new Error("claim returned null");
    await completeJob(testDatabase.db, claimed);
    expect(
      await failJob(testDatabase.db, claimed, { errorCode: "late_failure", retryable: true }),
    ).toBe("lease_lost");
    expect((await loadJob(enqueued.jobId)).status).toBe("completed");
  });
});

describe("payload com dado pessoal", () => {
  it("whatsapp.inbound concluído guarda só name e webhookEventId", async () => {
    const enqueued = await enqueueAt(whatsappPayload);
    const claimed = await claimAt(0, ["whatsapp.inbound"]);
    expect(claimed?.payload).toEqual(whatsappPayload);
    if (!claimed) throw new Error("claim returned null");
    await completeJob(testDatabase.db, claimed);
    expect((await loadJob(enqueued.jobId)).payload).toEqual({
      name: "whatsapp.inbound",
      webhookEventId: WEBHOOK_EVENT_ID,
    });
  });

  it("retry mantém o payload inteiro; falha definitiva reduz", async () => {
    const enqueued = await enqueueAt(whatsappPayload);
    const claimed = await claimAt(0, ["whatsapp.inbound"]);
    if (!claimed) throw new Error("claim returned null");
    await failJob(
      testDatabase.db,
      claimed,
      { errorCode: "send_failed", retryable: true },
      { now: baseNow },
    );
    expect((await loadJob(enqueued.jobId)).payload).toEqual(whatsappPayload);
    const retried = await claimAt(30, ["whatsapp.inbound"]);
    if (!retried) throw new Error("claim returned null");
    await failJob(testDatabase.db, retried, { errorCode: "send_failed", retryable: false });
    expect((await loadJob(enqueued.jobId)).payload).toEqual({
      name: "whatsapp.inbound",
      webhookEventId: WEBHOOK_EVENT_ID,
    });
  });

  it("payload de outros jobs fica intacto ao terminar", async () => {
    const enqueued = await enqueueAt({
      name: "order.notify",
      orderId: ORDER_ID,
      kind: "kit_ready",
    });
    const claimed = await claimAt(0, ["order.notify"]);
    if (!claimed) throw new Error("claim returned null");
    await completeJob(testDatabase.db, claimed);
    expect((await loadJob(enqueued.jobId)).payload).toEqual({
      name: "order.notify",
      orderId: ORDER_ID,
      kind: "kit_ready",
    });
  });
});

describe("recoverExpiredJobs", () => {
  it("devolve a pending o job com lock vencido e o lease antigo deixa de valer", async () => {
    const enqueued = await enqueueAt(generatePayload());
    const claimed = await claimJob(testDatabase.db, {
      nameList: ["order.generate"],
      workerId: "dead-worker",
      now: baseNow,
      lockTimeoutSeconds: 60,
    });
    if (!claimed) throw new Error("claim returned null");
    expect(await recoverExpiredJobs(testDatabase.db, { now: secondsAfter(59) })).toEqual({
      requeuedCount: 0,
      failedCount: 0,
    });
    expect(await recoverExpiredJobs(testDatabase.db, { now: secondsAfter(60) })).toEqual({
      requeuedCount: 1,
      failedCount: 0,
    });
    const row = await loadJob(enqueued.jobId);
    expect(row.status).toBe("pending");
    expect(row.lastErrorCode).toBe(jobErrorCodeMap.lockExpired);
    expect(row.lockedBy).toBeNull();
    const reclaimed = await claimAt(60);
    expect(reclaimed?.attemptCount).toBe(2);
    expect(await completeJob(testDatabase.db, claimed)).toBe(false);
    if (!reclaimed) throw new Error("claim returned null");
    expect(await completeJob(testDatabase.db, reclaimed)).toBe(true);
  });

  it("job sem tentativas restantes vai para failed e tem o payload pessoal reduzido", async () => {
    const enqueued = await enqueueJob(testDatabase.db, whatsappPayload, {
      runAfterDatetime: baseNow,
      maxAttemptCount: 1,
    });
    await claimJob(testDatabase.db, {
      nameList: ["whatsapp.inbound"],
      workerId: "dead-worker",
      now: baseNow,
      lockTimeoutSeconds: 60,
    });
    expect(await recoverExpiredJobs(testDatabase.db, { now: secondsAfter(61) })).toEqual({
      requeuedCount: 0,
      failedCount: 1,
    });
    const row = await loadJob(enqueued.jobId ?? "");
    expect(row.status).toBe("failed");
    expect(row.finishDatetime).toEqual(secondsAfter(61));
    expect(row.payload).toEqual({ name: "whatsapp.inbound", webhookEventId: WEBHOOK_EVENT_ID });
  });
});

describe("workJob", () => {
  const clock = () => baseNow;
  const workOptions = { nameList: ["order.generate"] as const, workerId: WORKER_ID, clock };

  it("fila vazia devolve idle sem chamar o handler", async () => {
    let called = false;
    const outcome = await workJob(testDatabase.db, {
      ...workOptions,
      handler: async () => {
        called = true;
        return ok(null);
      },
    });
    expect(outcome).toEqual({ outcome: "idle" });
    expect(called).toBe(false);
  });

  it("handler ok conclui o job e recebe o payload validado", async () => {
    const enqueued = await enqueueAt(generatePayload());
    const outcome = await workJob(testDatabase.db, {
      ...workOptions,
      handler: async (claimed) => {
        expect(claimed.payload).toEqual(generatePayload());
        return ok(null);
      },
    });
    expect(outcome).toEqual({
      outcome: "completed",
      jobId: enqueued.jobId,
      name: "order.generate",
      attemptCount: 1,
      errorCode: null,
    });
    expect((await loadJob(enqueued.jobId)).status).toBe("completed");
  });

  it("handler com falha transitória reagenda e com falha definitiva encerra", async () => {
    const retried = await enqueueAt(generatePayload());
    expect(
      await workJob(testDatabase.db, {
        ...workOptions,
        handler: async () => err({ errorCode: "provider_unavailable", retryable: true }),
      }),
    ).toMatchObject({
      outcome: "retry_scheduled",
      jobId: retried.jobId,
      errorCode: "provider_unavailable",
    });
    await truncateAllTables(testDatabase.db);
    const failed = await enqueueAt(generatePayload());
    expect(
      await workJob(testDatabase.db, {
        ...workOptions,
        handler: async () => err({ errorCode: "generation_blocked", retryable: false }),
      }),
    ).toMatchObject({ outcome: "failed", jobId: failed.jobId, errorCode: "generation_blocked" });
  });

  it("exceção no handler vira falha transitória unhandled_error com a causa no retorno", async () => {
    const enqueued = await enqueueAt(generatePayload());
    const thrown = new Error("boom");
    const outcome = await workJob(testDatabase.db, {
      ...workOptions,
      handler: async () => {
        throw thrown;
      },
    });
    expect(outcome).toMatchObject({
      outcome: "retry_scheduled",
      jobId: enqueued.jobId,
      errorCode: jobErrorCodeMap.unhandledError,
      cause: thrown,
    });
    const row = await loadJob(enqueued.jobId);
    expect(row.status).toBe("pending");
    expect(row.runAfterDatetime).toEqual(secondsAfter(30));
  });
});

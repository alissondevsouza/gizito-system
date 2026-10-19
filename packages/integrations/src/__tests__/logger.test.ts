import { describe, expect, it } from "bun:test";
import {
  createChargeInputSchema,
  createdChargeSchema,
  notificationAttachmentSchema,
  orderSchema,
  outboundNotificationSchema,
  webhookRequestSchema,
} from "@gizito/core";
import { createMemoryLogger } from "#src/fakes/memory-logger.ts";
import {
  BINARY_LOG_VALUE,
  DEPTH_LIMIT_LOG_VALUE,
  MAX_LOG_DEPTH,
  REDACTED_LOG_VALUE,
  redactedLogKeyList,
} from "#src/logger.ts";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";

function nestObject(depth: number, leaf: Record<string, unknown>): Record<string, unknown> {
  let value = leaf;
  for (let level = 0; level < depth; level += 1) value = { level: value };
  return value;
}

describe("createLogger", () => {
  it("escreve JSON com service, nível, horário ISO e mensagem", () => {
    const { logger, readEntryList } = createMemoryLogger({ level: "info" });
    logger.info({ orderId: ORDER_ID }, "job concluído");
    const [entry] = readEntryList();
    expect(entry).toMatchObject({
      service: "test",
      level: 30,
      orderId: ORDER_ID,
      msg: "job concluído",
    });
    expect(new Date(String(entry?.time)).toISOString()).toBe(String(entry?.time));
    expect(entry).not.toHaveProperty("hostname");
  });

  it("respeita o nível configurado", () => {
    const { logger, readEntryList } = createMemoryLogger({ level: "info" });
    logger.debug("detalhe");
    expect(readEntryList()).toHaveLength(0);
  });

  it("redige as chaves sensíveis no topo e em qualquer profundidade (invariante 9)", () => {
    const { logger, readEntryList } = createMemoryLogger({ level: "info" });
    const sensitive = Object.fromEntries(redactedLogKeyList.map((key) => [key, `valor-${key}`]));
    logger.info({ ...sensitive, job: { ...sensitive, jobId: "j-1", step: { ...sensitive } } }, "x");
    const [entry] = readEntryList();
    const job = entry?.job as Record<string, unknown>;
    const step = job.step as Record<string, unknown>;
    for (const key of redactedLogKeyList) {
      expect(entry?.[key]).toBe(REDACTED_LOG_VALUE);
      expect(job[key]).toBe(REDACTED_LOG_VALUE);
      expect(step[key]).toBe(REDACTED_LOG_VALUE);
    }
    expect(job.jobId).toBe("j-1");
    expect(JSON.stringify(entry)).not.toContain("valor-");
  });

  it("mascara pedido aninhado e itens de lista, mantendo o que é permitido", () => {
    const { logger, lineList, readEntryList } = createMemoryLogger({ level: "info" });
    logger.info(
      {
        order: { orderId: ORDER_ID, status: "paid", whatsappPhone: "+5511999998888" },
        list: [{ email: "mae@exemplo.com", durationMs: 12 }, [{ noteText: "observacao" }]],
      },
      "x",
    );
    const [entry] = readEntryList();
    expect(entry).toMatchObject({
      order: { orderId: ORDER_ID, status: "paid", whatsappPhone: REDACTED_LOG_VALUE },
      list: [{ email: REDACTED_LOG_VALUE, durationMs: 12 }, [{ noteText: REDACTED_LOG_VALUE }]],
    });
    const output = lineList.join("\n");
    for (const value of ["99999", "mae@", "observacao"]) expect(output).not.toContain(value);
  });

  it("reconhece a chave em snake_case, kebab-case e maiúsculas", () => {
    const { logger, lineList } = createMemoryLogger({ level: "info" });
    logger.info(
      {
        row: { note_text: "obs-1", payer_email: "obs-2", short_code: "obs-3" },
        headerMap: { Authorization: "obs-4", "api-key": "obs-5", COOKIE: "obs-6" },
      },
      "x",
    );
    expect(lineList.join("\n")).not.toContain("obs-");
  });

  it("Error em qualquer chave passa pelo serializer, sem detail nem params", () => {
    const { logger, lineList, readEntryList } = createMemoryLogger({ level: "info" });
    const pgError = Object.assign(new Error("duplicate key value violates unique constraint"), {
      name: "PostgresError",
      code: "ERR_POSTGRES_SERVER_ERROR",
      detail: "Key (email)=(mae@exemplo.com) already exists.",
      params: ["mae@exemplo.com"],
    });
    logger.info({ error: pgError, attemptList: [{ cause: pgError }] }, "x");
    const [entry] = readEntryList();
    expect(entry?.error).toMatchObject({
      type: "PostgresError",
      code: "ERR_POSTGRES_SERVER_ERROR",
      message: "duplicate key value violates unique constraint",
    });
    expect((entry?.attemptList as { cause: unknown }[] | undefined)?.[0]?.cause).toMatchObject({
      type: "PostgresError",
    });
    expect(lineList.join("\n")).not.toContain("mae@");
  });

  it("para de descer depois da profundidade máxima e troca binário por marcador", () => {
    const { logger, readEntryList } = createMemoryLogger({ level: "info" });
    logger.info(
      {
        deep: nestObject(MAX_LOG_DEPTH - 1, { email: "x" }),
        tooDeep: nestObject(MAX_LOG_DEPTH, { orderId: ORDER_ID }),
        photo: new Uint8Array([1, 2, 3]),
        when: new Date("2026-10-19T12:00:00.000Z"),
      },
      "x",
    );
    const [entry] = readEntryList();
    expect(entry?.deep).toEqual(nestObject(MAX_LOG_DEPTH - 1, { email: REDACTED_LOG_VALUE }));
    expect(entry?.tooDeep).toEqual(nestObject(MAX_LOG_DEPTH - 1, { level: DEPTH_LIMIT_LOG_VALUE }));
    expect(entry?.photo).toBe(BINARY_LOG_VALUE);
    expect(entry?.when).toBe("2026-10-19T12:00:00.000Z");
  });

  it("mascara os bindings do logger filho e do neto", () => {
    const { logger, lineList, readEntryList } = createMemoryLogger({ level: "info" });
    const child = logger.child({ orderId: ORDER_ID, recipient: "mae@exemplo.com" });
    child.info("filho");
    child
      .child({ job: { jobName: "order.notify", payload: { email: "pai@exemplo.com" } } })
      .info("neto");
    const [childEntry, grandchildEntry] = readEntryList();
    expect(childEntry).toMatchObject({ orderId: ORDER_ID, recipient: REDACTED_LOG_VALUE });
    expect(grandchildEntry).toMatchObject({
      orderId: ORDER_ID,
      recipient: REDACTED_LOG_VALUE,
      job: { jobName: "order.notify", payload: REDACTED_LOG_VALUE },
    });
    expect(lineList.join("\n")).not.toContain("@exemplo");
  });

  it("as chaves sensíveis do domínio têm o mesmo nome nos schemas do core", () => {
    const coreSensitiveFieldList: readonly (readonly [object, readonly string[]])[] = [
      [
        orderSchema.shape,
        ["email", "publicToken", "shortCode", "otherTopicText", "noteText", "whatsappPhone"],
      ],
      [createChargeInputSchema.shape, ["payerEmail"]],
      [createdChargeSchema.shape, ["qrCode", "qrCodeBase64"]],
      [
        outboundNotificationSchema.options[0].shape,
        ["recipient", "shortCode", "orderUrl", "textBody"],
      ],
      [notificationAttachmentSchema.shape, ["url"]],
      [webhookRequestSchema.shape, ["rawBody"]],
    ];
    for (const [shape, keyList] of coreSensitiveFieldList) {
      for (const key of keyList) {
        expect(Object.keys(shape)).toContain(key);
        expect<readonly string[]>(redactedLogKeyList).toContain(key);
      }
    }
  });
});

describe("createMemoryLogger", () => {
  it("guarda as linhas e resolve a espera quando o predicado bate", async () => {
    const { logger, readEntryList, waitForEntryList } = createMemoryLogger({ level: "info" });
    const waited = waitForEntryList((entryList) => entryList.some((entry) => entry.msg === "b"));
    logger.info("a");
    logger.debug("ignorado");
    logger.info("b");
    await waited;
    expect(readEntryList().map((entry) => entry.msg)).toEqual(["a", "b"]);
  });
});

import { describe, expect, it } from "bun:test";
import { createMemoryLogger } from "#src/fakes/memory-logger.ts";
import {
  MAX_LOG_TEXT_LENGTH,
  QUERY_ERROR_MESSAGE,
  scrubLogText,
  serializeLogError,
  TRUNCATED_LOG_TEXT_MARK,
} from "#src/log-error.ts";

const SYNTHETIC_NOTE_TEXT = "observacao-sintetica-do-responsavel";
const ORDER_ID = "0a1b2c3d-4e5f-4a6b-8c7d-551199998888";

class DrizzleQueryError extends Error {
  readonly query: string;
  readonly params: unknown[];

  constructor(query: string, params: unknown[], cause?: unknown) {
    super(`Failed query: ${query}\nparams: ${params}`);
    this.query = query;
    this.params = params;
    this.cause = cause;
    Error.captureStackTrace(this, DrizzleQueryError);
  }
}

function createPostgresError(message: string, detail: string) {
  return Object.assign(new Error(message), {
    name: "PostgresError",
    code: "ERR_POSTGRES_SERVER_ERROR",
    errno: "23505",
    detail,
  });
}

function createNoteQueryError() {
  return new DrizzleQueryError(
    'update "order" set "note_text" = $1 where "order_id" = $2',
    [`${SYNTHETIC_NOTE_TEXT}\n    at injetado (falso.ts:1:1)`, ORDER_ID],
    createPostgresError(
      'new row for relation "order" violates check constraint',
      `Failing row contains (${SYNTHETIC_NOTE_TEXT}).`,
    ),
  );
}

describe("scrubLogText", () => {
  it("mascara e-mail, telefone e token (privacy-security.md)", () => {
    expect(scrubLogText("Key (email)=(fulano.silva@example.com.br) already exists")).toBe(
      "Key (email)=([email]) already exists",
    );
    expect(scrubLogText("telefone +55 11 99999-8888 inválido")).toBe("telefone [phone] inválido");
    expect(scrubLogText("token abcdefghijABCDEFGHIJ0123456789_-xyzXYZ0123 recusado")).toBe(
      "token [token] recusado",
    );
  });

  it("reconhece telefone no formato brasileiro e no E.164", () => {
    for (const phone of [
      "(11) 99999-8888",
      "11 99999-8888",
      "11999998888",
      "5511999998888",
      "+5511999998888",
      "+55 (11) 3333-4444",
      "+14155552671",
    ]) {
      expect(scrubLogText(`fone ${phone} fim`)).toBe("fone [phone] fim");
    }
  });

  it("mascara e-mail com acento na parte local e domínio com hífen", () => {
    expect(scrubLogText("para joão.ç@exemplo-x.com.br, ok")).toBe("para [email], ok");
  });

  it("deixa intacto o texto sem dado pessoal", () => {
    for (const text of [
      "connection refused at 127.0.0.1:5433 (file.ts:12:34)",
      `order ${ORDER_ID} em 2026-10-19T12:34:56.789Z`,
      "at /app/node_modules/.bun/pkg@1.2.3/x.js:10:2 de @gizito/core",
      "pkg@1.2.3/x.js",
      "epoch 1760880000000 porta 65535 tentativa 3",
    ]) {
      expect(scrubLogText(text)).toBe(text);
    }
  });

  it("40 KB sem @ são mascarados em menos de 50 ms", () => {
    for (const text of ["a".repeat(40_000), "a.".repeat(20_000), "1".repeat(40_000)]) {
      const startTime = performance.now();
      scrubLogText(text);
      expect(performance.now() - startTime).toBeLessThan(50);
    }
  });

  it("trunca em 4.000 caracteres antes de mascarar, sem deixar pedaço de palavra cortada", () => {
    const text = `${"x ".repeat((MAX_LOG_TEXT_LENGTH - 6) / 2)}mae@exemplo.com.br depois`;
    const scrubbed = scrubLogText(text);
    expect(scrubbed.endsWith(` ${TRUNCATED_LOG_TEXT_MARK}`)).toBe(true);
    expect(scrubbed.length).toBeLessThanOrEqual(
      MAX_LOG_TEXT_LENGTH + TRUNCATED_LOG_TEXT_MARK.length,
    );
    expect(scrubbed).not.toContain("mae");
    expect(scrubLogText("y".repeat(MAX_LOG_TEXT_LENGTH))).toBe("[token]");
  });
});

describe("serializeLogError", () => {
  it("leva tipo, código, mensagem e stack mascarados; descarta detail, query e params", () => {
    const cause = Object.assign(new Error("duplicate key value fulano@example.com"), {
      code: "23505",
      detail: "Key (email)=(fulano@example.com) already exists",
    });
    const error = Object.assign(new Error("insert ... fulano@example.com", { cause }), {
      hint: "fulano@example.com",
    });
    const serialized = serializeLogError(error);
    expect(serialized).toMatchObject({
      type: "Error",
      message: "insert ... [email]",
      cause: { type: "Error", code: "23505", message: "duplicate key value [email]" },
    });
    expect(JSON.stringify(serialized)).not.toContain("fulano");
    expect(serialized).not.toHaveProperty("hint");
    expect(serialized.cause).not.toHaveProperty("detail");
  });

  it("erro de query do Drizzle vira Failed query, sem a query nem os params na mensagem e na stack", () => {
    const serialized = serializeLogError(createNoteQueryError());
    expect(serialized.message).toBe(QUERY_ERROR_MESSAGE);
    expect(serialized.stack?.startsWith(`Error: ${QUERY_ERROR_MESSAGE}\n`)).toBe(true);
    expect(serialized.stack).toContain("createNoteQueryError");
    expect(serialized.stack).not.toContain("injetado");
    expect(serialized).not.toHaveProperty("query");
    expect(serialized).not.toHaveProperty("params");
    expect(serialized.cause).toMatchObject({
      type: "PostgresError",
      code: "ERR_POSTGRES_SERVER_ERROR",
    });
    const json = JSON.stringify(serialized);
    expect(json).not.toContain(SYNTHETIC_NOTE_TEXT);
    expect(json).not.toContain("note_text");
  });

  it("40 KB de mensagem sem @ são serializados em menos de 50 ms", () => {
    const startTime = performance.now();
    const serialized = serializeLogError(new Error("a".repeat(40_000)));
    expect(performance.now() - startTime).toBeLessThan(50);
    expect(serialized.message).toBe(`[token]${TRUNCATED_LOG_TEXT_MARK}`);
  });

  it("valor que não é Error vira só o tipo", () => {
    expect(serializeLogError("fulano@example.com")).toEqual({
      type: "string",
      message: "[non-error value]",
    });
  });

  it("limita a profundidade da cadeia de causas", () => {
    let error = new Error("raiz");
    for (let index = 0; index < 10; index += 1)
      error = new Error(`nível ${index}`, { cause: error });
    let depth = 0;
    let current = serializeLogError(error).cause;
    while (current) {
      depth += 1;
      current = current.cause;
    }
    expect(depth).toBe(3);
  });

  it("o logger aplica o serializer à chave err", () => {
    const { logger, readEntryList } = createMemoryLogger();
    logger.debug({ err: Object.assign(new Error("de fulano@example.com"), { detail: "x" }) }, "d");
    const [entry] = readEntryList();
    expect(entry?.err).toMatchObject({ type: "Error", message: "de [email]" });
    expect(JSON.stringify(entry)).not.toContain("fulano");
    expect(JSON.stringify(entry)).not.toContain("detail");
  });

  it("DrizzleQueryError com note_text nos params não aparece no log, em err nem em outra chave", () => {
    const { logger, lineList, readEntryList } = createMemoryLogger();
    logger.error({ orderId: ORDER_ID, err: createNoteQueryError() }, "falha");
    logger.error({ orderId: ORDER_ID, job: { error: createNoteQueryError() } }, "falha");
    logger.error(createNoteQueryError(), "falha");
    const output = lineList.join("\n");
    expect(output).not.toContain(SYNTHETIC_NOTE_TEXT);
    expect(output).not.toContain("note_text");
    const [first, second, third] = readEntryList();
    expect(first?.err).toMatchObject({ message: QUERY_ERROR_MESSAGE });
    expect((second?.job as { error: unknown } | undefined)?.error).toMatchObject({
      message: QUERY_ERROR_MESSAGE,
    });
    expect(third?.err).toMatchObject({ message: QUERY_ERROR_MESSAGE });
    expect(first?.orderId).toBe(ORDER_ID);
  });
});

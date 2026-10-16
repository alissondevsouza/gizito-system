import { describe, expect, it } from "bun:test";
import { createMemoryLogger } from "#src/fakes/memory-logger.ts";
import { scrubLogText, serializeLogError } from "#src/log-error.ts";

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

  it("deixa intacto o texto sem dado pessoal", () => {
    const text = "connection refused at 127.0.0.1:5433 (file.ts:12:34)";
    expect(scrubLogText(text)).toBe(text);
  });
});

describe("serializeLogError", () => {
  it("leva tipo, código, mensagem e stack mascarados; descarta detail, query e params", () => {
    const cause = Object.assign(new Error("duplicate key value"), {
      code: "23505",
      detail: "Key (email)=(fulano@example.com) already exists",
    });
    const error = Object.assign(
      new Error("Failed query: insert ... fulano@example.com", { cause }),
      {
        query: "insert into order ...",
        params: ["fulano@example.com"],
      },
    );
    const serialized = serializeLogError(error);
    expect(serialized).toMatchObject({
      type: "Error",
      message: "Failed query: insert ... [email]",
      cause: { type: "Error", code: "23505", message: "duplicate key value" },
    });
    expect(JSON.stringify(serialized)).not.toContain("fulano");
    expect(serialized).not.toHaveProperty("query");
    expect(serialized).not.toHaveProperty("params");
    expect(serialized.cause).not.toHaveProperty("detail");
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
});

import { describe, expect, it } from "bun:test";
import { createMemoryLogger } from "#src/fakes/memory-logger.ts";
import { REDACTED_LOG_VALUE, redactedLogKeyList } from "#src/logger.ts";

describe("createLogger", () => {
  it("escreve JSON com service, nível, horário ISO e mensagem", () => {
    const { logger, readEntryList } = createMemoryLogger({ level: "info" });
    logger.info({ orderId: "11111111-1111-4111-8111-111111111111" }, "job concluído");
    const [entry] = readEntryList();
    expect(entry).toMatchObject({
      service: "test",
      level: 30,
      orderId: "11111111-1111-4111-8111-111111111111",
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

  it("redige campos pessoais no topo e um nível abaixo (invariante 9)", () => {
    const { logger, readEntryList } = createMemoryLogger({ level: "info" });
    const sensitive = Object.fromEntries(redactedLogKeyList.map((key) => [key, `valor-${key}`]));
    logger.info({ ...sensitive, job: { ...sensitive, jobId: "j-1" } }, "x");
    const [entry] = readEntryList();
    const nested = entry?.job as Record<string, unknown>;
    for (const key of redactedLogKeyList) {
      expect(entry?.[key]).toBe(REDACTED_LOG_VALUE);
      expect(nested[key]).toBe(REDACTED_LOG_VALUE);
    }
    expect(nested.jobId).toBe("j-1");
    expect(JSON.stringify(entry)).not.toContain("valor-");
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

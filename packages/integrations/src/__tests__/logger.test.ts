import { describe, expect, it } from "bun:test";
import { createLogger, REDACTED_LOG_VALUE, redactedLogKeyList } from "#src/logger.ts";

function createMemoryLogger(level: "info" | "debug" = "info") {
  const lineList: string[] = [];
  const logger = createLogger({
    service: "test",
    level,
    destination: { write: (line: string) => lineList.push(line) },
  });
  const readEntryList = () => lineList.map((line) => JSON.parse(line) as Record<string, unknown>);
  return { logger, readEntryList };
}

describe("createLogger", () => {
  it("escreve JSON com service, nível, horário ISO e mensagem", () => {
    const { logger, readEntryList } = createMemoryLogger();
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
    const { logger, readEntryList } = createMemoryLogger("info");
    logger.debug("detalhe");
    expect(readEntryList()).toHaveLength(0);
  });

  it("redige campos pessoais no topo e um nível abaixo (invariante 9)", () => {
    const { logger, readEntryList } = createMemoryLogger();
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

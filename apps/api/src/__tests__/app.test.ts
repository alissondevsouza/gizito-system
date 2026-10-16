import { afterAll, describe, expect, it } from "bun:test";
import { apiErrorSchema, apiHealthSchema } from "@gizito/core";
import { createDatabase } from "@gizito/db";
import { createMemoryLogger } from "#src/__tests__/__fixtures__/memory-logger.ts";
import { createApp, UNMATCHED_ROUTE } from "#src/app.ts";

const WEB_PUBLIC_URL = "http://localhost:3000";
const unreachableDatabase = createDatabase({
  databaseUrl: "postgres://gizito:gizito@127.0.0.1:1/gizito",
  maxConnections: 1,
});

afterAll(async () => {
  await unreachableDatabase.close();
});

function createTestApp() {
  const memoryLogger = createMemoryLogger();
  const app = createApp({
    db: unreachableDatabase.db,
    logger: memoryLogger.logger,
    webPublicUrl: `${WEB_PUBLIC_URL}/`,
  });
  return { app, ...memoryLogger };
}

const request = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init);

describe("api sem banco", () => {
  it("GET /health responde 503 unavailable e loga o motivo sem detalhe", async () => {
    const { app, readEntryList } = createTestApp();
    const response = await app.handle(request("/health"));
    expect(response.status).toBe(503);
    expect(apiHealthSchema.parse(await response.json())).toEqual({ status: "unavailable" });
    const warn = readEntryList().find((entry) => entry.level === 40);
    expect(warn).toMatchObject({ errorCode: "database_unavailable" });
    expect(warn).not.toHaveProperty("err");
  });
});

describe("erros e log de request", () => {
  it("rota desconhecida responde 404 no formato { error, code }", async () => {
    const { app } = createTestApp();
    const response = await app.handle(request("/nada"));
    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(await response.json()).code).toBe("not_found");
  });

  it("loga método, padrão da rota, status e duração, nunca a URL com token", async () => {
    const { app, lineList, readEntryList, waitForEntryList } = createTestApp();
    const token = "tokenSecretoDoPedidoQueNuncaPodeIrParaOLog12";
    await app.handle(request(`/orders/${token}`));
    await app.handle(request("/health"));
    await waitForEntryList(
      (entryList) => entryList.filter((entry) => entry.msg === "request").length === 2,
    );
    const requestEntryList = readEntryList().filter((entry) => entry.msg === "request");
    expect(
      requestEntryList.map(({ method, route, status }) => ({ method, route, status })),
    ).toEqual([
      { method: "GET", route: UNMATCHED_ROUTE, status: 404 },
      { method: "GET", route: "/health", status: 503 },
    ]);
    for (const entry of requestEntryList) {
      expect(typeof entry.durationMs).toBe("number");
    }
    expect(lineList.join("\n")).not.toContain(token);
  });
});

describe("CORS restrito ao web (api.md §1)", () => {
  it("devolve Access-Control-Allow-Origin só para a origem de WEB_PUBLIC_URL", async () => {
    const { app } = createTestApp();
    const allowed = await app.handle(request("/health", { headers: { origin: WEB_PUBLIC_URL } }));
    expect(allowed.headers.get("access-control-allow-origin")).toBe(WEB_PUBLIC_URL);
    const denied = await app.handle(
      request("/health", { headers: { origin: "https://outro-site.example" } }),
    );
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("preflight de outra origem não libera a chamada", async () => {
    const { app } = createTestApp();
    const preflight = await app.handle(
      request("/health", {
        method: "OPTIONS",
        headers: { origin: "https://outro-site.example", "access-control-request-method": "GET" },
      }),
    );
    expect(preflight.headers.get("access-control-allow-origin")).toBeNull();
  });
});

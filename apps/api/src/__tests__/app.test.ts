import { afterAll, describe, expect, it } from "bun:test";
import { apiErrorSchema, apiHealthSchema, MAX_ORDER_UPLOAD_BYTES } from "@gizito/core";
import { createDatabase } from "@gizito/db";
import { createMemoryLogger } from "@gizito/integrations/fakes";
import { status } from "elysia";
import { z } from "zod";
import { buildAppDependencies, WEB_PUBLIC_URL } from "#src/__tests__/__fixtures__/app.ts";
import { createApp, createBackgroundRunner, UNMATCHED_ROUTE } from "#src/app.ts";

const unreachableDatabase = createDatabase({
  databaseUrl: "postgres://gizito:gizito@127.0.0.1:1/gizito",
  maxConnections: 1,
});

afterAll(async () => {
  await unreachableDatabase.close();
});

function createTestApp() {
  const memoryLogger = createMemoryLogger();
  const app = createApp(
    buildAppDependencies(unreachableDatabase.db, memoryLogger.logger, {
      webPublicUrl: `${WEB_PUBLIC_URL}/`,
    }),
  );
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
      { method: "GET", route: "/orders/:token", status: 404 },
      { method: "GET", route: "/health", status: 503 },
    ]);
    for (const entry of requestEntryList) {
      expect(typeof entry.durationMs).toBe("number");
    }
    expect(lineList.join("\n")).not.toContain(token);
  });
});

describe("erros lançados por rotas", () => {
  const orderNotFound = { error: "Pedido não encontrado.", code: "order_not_found" } as const;

  function createAppWithRouteList() {
    const testApp = createTestApp();
    const app = testApp.app
      .get("/lancado", () => {
        throw status(404, orderNotFound);
      })
      .get("/devolvido", () => status(404, orderNotFound))
      .get("/bule", () => new Response("sou um bule", { status: 418 }))
      .get("/excecao", () => {
        throw new TypeError("dado-do-cliente@example.com");
      })
      .post("/corpo", ({ body }) => body, { body: z.object({ grade: z.string() }) });
    return { ...testApp, app };
  }

  it("status lançado chega ao cliente com o mesmo status e corpo, sem log de erro", async () => {
    const { app, readEntryList } = createAppWithRouteList();
    const response = await app.handle(request("/lancado"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(orderNotFound);
    expect(readEntryList().some((entry) => entry.level >= 50)).toBe(false);
  });

  it("exceção vira 500 internal_error e o log error leva só o nome do erro", async () => {
    const { app, readEntryList } = createAppWithRouteList();
    const response = await app.handle(request("/excecao"));
    expect(response.status).toBe(500);
    expect(apiErrorSchema.parse(await response.json()).code).toBe("internal_error");
    const errorEntry = readEntryList().find((entry) => entry.level === 50);
    expect(errorEntry).toMatchObject({ errorCode: "internal_error", errorName: "TypeError" });
    expect(JSON.stringify(errorEntry)).not.toContain("dado-do-cliente");
  });

  it("corpo malformado e corpo fora do schema viram 400 validation_error", async () => {
    const { app } = createAppWithRouteList();
    const headers = { "content-type": "application/json" };
    for (const body of ["{quebrado", JSON.stringify({ grade: 5 })]) {
      const response = await app.handle(request("/corpo", { method: "POST", headers, body }));
      expect(response.status).toBe(400);
      expect(apiErrorSchema.parse(await response.json()).code).toBe("validation_error");
    }
  });

  it("log request usa o status real do Response devolvido e o código das respostas de erro", async () => {
    const { app, readEntryList, waitForEntryList } = createAppWithRouteList();
    const pathList = ["/bule", "/lancado", "/devolvido", "/excecao", "/nada", "/corpo"];
    for (const path of pathList) {
      const response = await app.handle(
        request(path, path === "/corpo" ? { method: "POST", body: "{quebrado" } : undefined),
      );
      await response.arrayBuffer();
    }
    await waitForEntryList(
      (entryList) =>
        entryList.filter((entry) => entry.msg === "request").length === pathList.length,
    );
    const requestEntryList = readEntryList()
      .filter((entry) => entry.msg === "request")
      .map(({ route, status, errorCode }) => ({ route, status, errorCode }));
    expect(requestEntryList).toEqual([
      { route: "/bule", status: 418, errorCode: undefined },
      { route: "/lancado", status: 404, errorCode: "order_not_found" },
      { route: "/devolvido", status: 404, errorCode: "order_not_found" },
      { route: "/excecao", status: 500, errorCode: "internal_error" },
      { route: UNMATCHED_ROUTE, status: 404, errorCode: "not_found" },
      { route: "/corpo", status: 400, errorCode: "validation_error" },
    ]);
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

describe("limite do corpo e CORS com credenciais (F2-01)", () => {
  it("Content-Length acima de MAX_ORDER_UPLOAD_BYTES dá 413 payload_too_large antes de ler o corpo", async () => {
    const { app, readEntryList, waitForEntryList } = createTestApp();
    const response = await app.handle(
      request("/orders", {
        method: "POST",
        headers: {
          "content-length": String(MAX_ORDER_UPLOAD_BYTES + 1),
          "content-type": "multipart/form-data; boundary=x",
        },
        body: "--x--",
      }),
    );
    expect(response.status).toBe(413);
    expect(apiErrorSchema.parse(await response.json()).code).toBe("payload_too_large");
    await waitForEntryList((entryList) => entryList.some((entry) => entry.msg === "request"));
    expect(readEntryList().find((entry) => entry.msg === "request")).toMatchObject({
      status: 413,
      errorCode: "payload_too_large",
    });
  });

  it("CORS libera credenciais só para a origem do web", async () => {
    const { app } = createTestApp();
    const response = await app.handle(request("/health", { headers: { origin: WEB_PUBLIC_URL } }));
    expect(response.headers.get("access-control-allow-origin")).toBe(WEB_PUBLIC_URL);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
  });
});

describe("tarefa em segundo plano (F2-01)", () => {
  it("o executor padrão loga só o nome do erro quando a tarefa rejeita", async () => {
    const { logger, readEntryList, waitForEntryList } = createMemoryLogger();
    createBackgroundRunner(logger)(async () => {
      throw new TypeError("detalhe com dado do pedido");
    });
    await waitForEntryList((entryList) => entryList.some((entry) => entry.level === 50));
    const entry = readEntryList().find((logEntry) => logEntry.level === 50);
    expect(entry).toMatchObject({ msg: "tarefa em segundo plano falhou", errorName: "TypeError" });
    expect(JSON.stringify(entry)).not.toContain("detalhe");
  });
});

import { afterEach, describe, expect, it } from "bun:test";
import { fetchWithoutIdleTimeout } from "#src/ai/runtime-fetch.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchWithoutIdleTimeout (spec F1-07, timeout de 300 s do fetch do Bun)", () => {
  it("desliga o timeout de inatividade do Bun e mantém o resto do pedido", async () => {
    const seenList: unknown[] = [];
    globalThis.fetch = Object.assign(
      async (_input: string | URL | Request, init?: BunFetchRequestInit) => {
        seenList.push(init);
        return new Response("ok");
      },
      { preconnect: originalFetch.preconnect },
    );
    const controller = new AbortController();
    await fetchWithoutIdleTimeout("https://api.example.test/v1/messages", {
      method: "POST",
      body: "{}",
      signal: controller.signal,
    });
    expect(seenList).toEqual([
      { method: "POST", body: "{}", signal: controller.signal, timeout: false },
    ]);
  });

  it("responde de um servidor real sem mudar o corpo", async () => {
    globalThis.fetch = originalFetch;
    const server = Bun.serve({ port: 0, fetch: () => new Response("pronto") });
    try {
      const response = await fetchWithoutIdleTimeout(`http://localhost:${server.port}/`);
      expect(await response.text()).toBe("pronto");
    } finally {
      await server.stop(true);
    }
  });
});

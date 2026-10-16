import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { apiHealthSchema } from "@gizito/core";
import {
  createTestDatabase,
  resolveTestDatabaseUrl,
  type TestDatabase,
  withDatabaseName,
} from "@gizito/db/test-helpers";
import { createLogger } from "@gizito/integrations";
import { findFreePort, waitForHttpStatus } from "#src/__tests__/integration/helpers.ts";
import { createApp } from "#src/app.ts";

const entryPath = join(import.meta.dir, "..", "..", "index.ts");

let testDatabase: TestDatabase;

beforeAll(async () => {
  testDatabase = await createTestDatabase();
});

afterAll(async () => {
  await testDatabase.destroy();
});

describe("GET /health com banco", () => {
  it("responde 200 ok", async () => {
    const app = createApp({
      db: testDatabase.db,
      logger: createLogger({ service: "api-test", level: "silent" }),
      webPublicUrl: "http://localhost:3000",
    });
    const response = await app.handle(new Request("http://localhost/health"));
    expect(response.status).toBe(200);
    expect(apiHealthSchema.parse(await response.json())).toEqual({ status: "ok" });
  });
});

describe("processo da api", () => {
  it("sobe, responde /health e sai com 0 no SIGTERM", async () => {
    const port = await findFreePort();
    const child = Bun.spawn(["bun", entryPath], {
      env: {
        PATH: process.env.PATH ?? "",
        DATABASE_URL: withDatabaseName(resolveTestDatabaseUrl(), testDatabase.databaseName),
        WEB_PUBLIC_URL: "http://localhost:3000",
        API_PORT: String(port),
        LOG_LEVEL: "info",
        PAYMENT_GATEWAY: "fake",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    try {
      const response = await waitForHttpStatus(`http://127.0.0.1:${port}/health`, 200, child);
      expect(await response.json()).toEqual({ status: "ok" });
      child.kill("SIGTERM");
      expect(await child.exited).toBe(0);
      const stdout = await new Response(child.stdout).text();
      const messageList = stdout
        .trim()
        .split("\n")
        .map((line) => (JSON.parse(line) as { msg: string }).msg);
      expect(messageList).toContain("api no ar");
      expect(messageList).toContain("api parando");
    } finally {
      child.kill("SIGKILL");
    }
  });
});

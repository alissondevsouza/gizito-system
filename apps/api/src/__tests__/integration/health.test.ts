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
import { buildAppDependencies, CLIENT_HASH_SECRET } from "#src/__tests__/__fixtures__/app.ts";
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
    const app = createApp(
      buildAppDependencies(testDatabase.db, createLogger({ service: "api-test", level: "silent" })),
    );
    const response = await app.handle(new Request("http://localhost/health"));
    expect(response.status).toBe(200);
    expect(apiHealthSchema.parse(await response.json())).toEqual({ status: "ok" });
  });
});

function spawnApi(port: number) {
  return Bun.spawn(["bun", entryPath], {
    env: {
      PATH: process.env.PATH ?? "",
      NODE_ENV: "test",
      DATABASE_URL: withDatabaseName(resolveTestDatabaseUrl(), testDatabase.databaseName),
      WEB_PUBLIC_URL: "http://localhost:3000",
      API_PORT: String(port),
      LOG_LEVEL: "info",
      PAYMENT_GATEWAY: "fake",
      R2_ENDPOINT: "http://127.0.0.1:9000",
      R2_BUCKET: "gizito",
      R2_ACCESS_KEY_ID: "gizito",
      R2_SECRET_ACCESS_KEY: "gizito-local-dev",
      CLIENT_HASH_SECRET,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
}

describe("processo da api", () => {
  it("sobe, responde /health e sai com 0 no SIGTERM", async () => {
    const port = await findFreePort();
    const child = spawnApi(port);
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

  it("segundo processo na mesma porta não sobe, porque reusePort está desligado", async () => {
    const port = await findFreePort();
    const first = spawnApi(port);
    try {
      await waitForHttpStatus(`http://127.0.0.1:${port}/health`, 200, first);
      const second = spawnApi(port);
      try {
        expect(await second.exited).not.toBe(0);
        expect(await new Response(second.stdout).text()).not.toContain("api no ar");
      } finally {
        second.kill("SIGKILL");
      }
      expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(200);
    } finally {
      first.kill("SIGKILL");
    }
  });
});

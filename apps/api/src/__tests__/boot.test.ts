import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const entryPath = join(import.meta.dir, "..", "index.ts");

describe("boot da api", () => {
  it("sem as obrigatórias sai com 1 e nomeia cada campo antes de abrir porta", async () => {
    const child = Bun.spawn(["bun", entryPath], {
      env: { PATH: process.env.PATH ?? "" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await child.exited;
    const stderr = await new Response(child.stderr).text();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("NODE_ENV");
    expect(stderr).toContain("DATABASE_URL");
    expect(stderr).toContain("WEB_PUBLIC_URL");
    expect(stderr).toContain("PAYMENT_GATEWAY");
    expect(stderr).toContain("R2_ENDPOINT");
    expect(stderr).toContain("CLIENT_HASH_SECRET");
    expect(await new Response(child.stdout).text()).toBe("");
  });
});

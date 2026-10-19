import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const entryPath = join(import.meta.dir, "..", "index.ts");

describe("boot do worker", () => {
  it("sem NODE_ENV e DATABASE_URL sai com 1 e nomeia os campos antes de abrir porta", async () => {
    const child = Bun.spawn(["bun", entryPath], {
      env: { PATH: process.env.PATH ?? "" },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await child.exited).toBe(1);
    const stderr = await new Response(child.stderr).text();
    expect(stderr).toContain("NODE_ENV");
    expect(stderr).toContain("DATABASE_URL");
    expect(await new Response(child.stdout).text()).toBe("");
  });
});

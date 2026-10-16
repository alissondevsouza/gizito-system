import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const entryPath = join(import.meta.dir, "..", "index.ts");

describe("boot do worker", () => {
  it("sem DATABASE_URL sai com 1 e nomeia o campo antes de abrir porta", async () => {
    const child = Bun.spawn(["bun", entryPath], {
      env: { PATH: process.env.PATH ?? "" },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await child.exited).toBe(1);
    expect(await new Response(child.stderr).text()).toContain("DATABASE_URL");
    expect(await new Response(child.stdout).text()).toBe("");
  });
});

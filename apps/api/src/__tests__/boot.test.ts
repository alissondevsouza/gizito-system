import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const entryPath = join(import.meta.dir, "..", "index.ts");

describe("boot da api", () => {
  it("sem DATABASE_URL e WEB_PUBLIC_URL sai com 1 e nomeia os campos antes de abrir porta", async () => {
    const child = Bun.spawn(["bun", entryPath], {
      env: { PATH: process.env.PATH ?? "" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await child.exited;
    const stderr = await new Response(child.stderr).text();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("DATABASE_URL");
    expect(stderr).toContain("WEB_PUBLIC_URL");
    expect(await new Response(child.stdout).text()).toBe("");
  });
});

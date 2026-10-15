import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const srcDir = join(import.meta.dir, "..");

function listSourceFileList(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === "__tests__" ? [] : listSourceFileList(path);
    return entry.endsWith(".ts") ? [path] : [];
  });
}

const importSpecifierPattern = /(?:\bfrom\s+|\bimport\s*\(\s*|^import\s+)"([^"]+)"/gm;
const forbiddenPatternList: readonly RegExp[] = [
  /process\.env/,
  /Date\.now\(/,
  /new Date\(\s*\)/,
  /Math\.random\(/,
  /\bfetch\(/,
  /\bBun\./,
  /\brequire\(/,
  /\bconsole\./,
  /\bsetTimeout\(/,
];

const sourceFileList = listSourceFileList(srcDir);

describe("core é domínio puro (rule core.md)", () => {
  it("encontrou os arquivos de src fora de __tests__", () => {
    expect(sourceFileList.length).toBeGreaterThan(10);
  });

  for (const file of sourceFileList) {
    const name = relative(srcDir, file);
    const content = readFileSync(file, "utf8");

    it(`${name} só importa zod e #src/*.ts`, () => {
      const specifierList = [...content.matchAll(importSpecifierPattern)].map((m) => m[1]);
      for (const specifier of specifierList) {
        expect(specifier === "zod" || /^#src\/.+\.ts$/.test(specifier ?? "")).toBe(true);
      }
    });

    it(`${name} não faz IO nem lê relógio, env ou aleatoriedade`, () => {
      for (const pattern of forbiddenPatternList) {
        expect(content).not.toMatch(pattern);
      }
    });
  }
});

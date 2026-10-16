import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const readSibling = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url).href), "utf8");

const appCss = readSibling("../../styles/app.css");
const designDoc = readSibling("../../../../../docs/design/design-doc-v1.md");

const designTokenPattern = /^\| `(--color-[a-z-]+)` \| `(#[0-9A-Fa-f]{6})` \|/gm;
const cssTokenPattern = /^\s*(--color-[a-z-]+):\s*(#[0-9A-Fa-f]{6});/gm;

const toTokenMap = (source: string, pattern: RegExp) =>
  Object.fromEntries(
    [...source.matchAll(pattern)].map(([, name, value]) => [name, value?.toUpperCase()]),
  );

describe("tokens de cor (design doc §4.1)", () => {
  it("a tabela do design doc tem os 12 tokens", () => {
    expect(Object.keys(toTokenMap(designDoc, designTokenPattern))).toHaveLength(12);
  });

  it("o tema do Tailwind tem exatamente os tokens do design doc, com os mesmos valores", () => {
    expect(toTokenMap(appCss, cssTokenPattern)).toEqual(toTokenMap(designDoc, designTokenPattern));
  });

  it("a paleta padrão do Tailwind fica desligada", () => {
    expect(appCss).toContain("--color-*: initial;");
  });
});

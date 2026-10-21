import { describe, expect, it } from "bun:test";
import { loadKatexStylesheet } from "#src/katex/stylesheet.ts";

describe("loadKatexStylesheet (spec F1-08, RF-04)", () => {
  it("embute as fontes woff2 em data URL e não aponta para arquivo", async () => {
    const stylesheet = await loadKatexStylesheet();
    expect(stylesheet).not.toContain("url(fonts/");
    expect(stylesheet).not.toContain('format("woff")');
    expect(stylesheet).not.toContain('format("truetype")');
    expect(stylesheet.match(/url\(data:font\/woff2;base64,/g)?.length).toBe(20);
    expect(stylesheet).toContain("font-family:KaTeX_Main");
    expect(stylesheet).toContain(".katex .mfrac");
  });
});

const FONT_SOURCE_PATTERN = /src:url\(fonts\/([\w-]+\.woff2)\) format\("woff2"\)[^;}]*/g;

export class KatexStylesheetError extends Error {
  override readonly name = "KatexStylesheetError";
}

async function woff2DataUrl(fontDirectoryUrl: URL, fileName: string): Promise<string> {
  const bytes = await Bun.file(new URL(fileName, fontDirectoryUrl)).bytes();
  return `data:font/woff2;base64,${bytes.toBase64()}`;
}

export async function loadKatexStylesheet(): Promise<string> {
  const stylesheetUrl = new URL(import.meta.resolve("katex/dist/katex.min.css"));
  const fontDirectoryUrl = new URL("fonts/", stylesheetUrl);
  const stylesheet = await Bun.file(stylesheetUrl).text();
  const fileNameList = [
    ...new Set([...stylesheet.matchAll(FONT_SOURCE_PATTERN)].map(([, name]) => name ?? "")),
  ];
  const dataUrlByFileName = new Map(
    await Promise.all(
      fileNameList.map(
        async (fileName) => [fileName, await woff2DataUrl(fontDirectoryUrl, fileName)] as const,
      ),
    ),
  );
  const inlined = stylesheet.replace(
    FONT_SOURCE_PATTERN,
    (_source, fileName: string) => `src:url(${dataUrlByFileName.get(fileName)}) format("woff2")`,
  );
  if (inlined.includes("url(fonts/")) {
    throw new KatexStylesheetError("katex stylesheet has a font source outside the woff2 pattern");
  }
  return inlined;
}

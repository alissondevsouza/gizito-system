import { loadKatexStylesheet } from "@gizito/integrations";

export type MascotPose = "hello" | "success" | "point";

export type RenderAssets = {
  readonly stylesheet: string;
  readonly marginalFontStylesheet: string;
  readonly mascotDataUrlMap: Readonly<Record<MascotPose, string>>;
};

const fontWeightList = [400, 700, 800] as const;
const marginalFontWeightList = [400, 800] as const;

const fontSubsetList = [
  {
    name: "latin",
    unicodeRange:
      "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  },
  {
    name: "latin-ext",
    unicodeRange:
      "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
  },
] as const;

export const BRAND_FONT_FAMILY = "Nunito Sans";

async function dataUrlOf(fileUrl: URL, mediaType: string): Promise<string> {
  const bytes = await Bun.file(fileUrl).bytes();
  return `data:${mediaType};base64,${bytes.toBase64()}`;
}

type FontWeight = (typeof fontWeightList)[number];

async function brandFontFaceList(weightList: readonly FontWeight[]): Promise<readonly string[]> {
  return Promise.all(
    fontSubsetList.flatMap((subset) =>
      weightList.map(async (weight) => {
        const fileUrl = new URL(
          import.meta.resolve(
            `@fontsource/nunito-sans/files/nunito-sans-${subset.name}-${weight}-normal.woff2`,
          ),
        );
        const dataUrl = await dataUrlOf(fileUrl, "font/woff2");
        return `@font-face{font-family:"${BRAND_FONT_FAMILY}";font-style:normal;font-display:block;font-weight:${weight};src:url(${dataUrl}) format("woff2");unicode-range:${subset.unicodeRange}}`;
      }),
    ),
  );
}

async function mascotDataUrl(pose: MascotPose): Promise<string> {
  return dataUrlOf(new URL(`assets/gizito-${pose}.png`, import.meta.url), "image/png");
}

async function readRenderAssets(): Promise<RenderAssets> {
  const [fontFaceList, marginalFontFaceList, katexStylesheet, hello, success, point] =
    await Promise.all([
      brandFontFaceList(fontWeightList),
      brandFontFaceList(marginalFontWeightList),
      loadKatexStylesheet(),
      mascotDataUrl("hello"),
      mascotDataUrl("success"),
      mascotDataUrl("point"),
    ]);
  return {
    stylesheet: [...fontFaceList, katexStylesheet].join("\n"),
    marginalFontStylesheet: marginalFontFaceList.join("\n"),
    mascotDataUrlMap: { hello, success, point },
  };
}

let renderAssetsPromise: Promise<RenderAssets> | null = null;

export function loadRenderAssets(): Promise<RenderAssets> {
  renderAssetsPromise ??= readRenderAssets().catch((error: unknown) => {
    renderAssetsPromise = null;
    throw error;
  });
  return renderAssetsPromise;
}

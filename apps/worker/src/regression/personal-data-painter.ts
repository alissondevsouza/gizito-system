import { type Browser, chromium } from "playwright";
import sharp from "sharp";
import type { PersonalDataLabel, PersonalDataPainter } from "#src/regression/case-photo.ts";
import { BRAND_FONT_FAMILY, loadRenderAssets } from "#src/render/assets.ts";
import { escapeHtml } from "#src/render/html.ts";

const LABEL_FONT_SIZE_SHARE_OF_WIDTH = 0.021;
const LABEL_INK_COLOR = "#1f2f7a";
const LABEL_ROTATION_DEGREE = -1.2;

function labelPageOf(
  imageDataUrl: string,
  width: number,
  height: number,
  label: PersonalDataLabel,
  fontStylesheet: string,
): string {
  const fontSizePx = Math.round(width * LABEL_FONT_SIZE_SHARE_OF_WIDTH);
  const lineMarkup = label.lineList.map((line) => `<div>${escapeHtml(line)}</div>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fontStylesheet}
html,body{margin:0;padding:0}
.page{position:relative;width:${width}px;height:${height}px;background:url(${imageDataUrl}) no-repeat 0 0/${width}px ${height}px}
.label{position:absolute;left:${label.leftPercent}%;top:${label.topPercent}%;font-family:"${BRAND_FONT_FAMILY}";font-weight:400;font-size:${fontSizePx}px;line-height:1.3;color:${LABEL_INK_COLOR};transform:rotate(${LABEL_ROTATION_DEGREE}deg);transform-origin:left top;white-space:nowrap}
</style></head><body><div class="page"><div class="label">${lineMarkup}</div></div></body></html>`;
}

export function createPersonalDataPainter(
  launchBrowser: () => Promise<Browser> = () => chromium.launch({ headless: true }),
): PersonalDataPainter {
  let browserPromise: Promise<Browser> | null = null;
  return {
    async paint(image, label) {
      const metadata = await sharp(image).metadata();
      const width = metadata.width;
      const height = metadata.height;
      const pngBytes = new Uint8Array(await sharp(image).png().toBuffer());
      const imageDataUrl = `data:image/png;base64,${pngBytes.toBase64()}`;
      const { marginalFontStylesheet } = await loadRenderAssets();
      browserPromise ??= launchBrowser();
      const browser = await browserPromise;
      const context = await browser.newContext({
        javaScriptEnabled: true,
        offline: true,
        viewport: { width, height },
        deviceScaleFactor: 1,
      });
      try {
        const page = await context.newPage();
        await page.setContent(
          labelPageOf(imageDataUrl, width, height, label, marginalFontStylesheet),
        );
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        const screenshot = await page.screenshot({
          type: "png",
          clip: { x: 0, y: 0, width, height },
        });
        return new Uint8Array(screenshot);
      } finally {
        await context.close();
      }
    },
    async close() {
      const pending = browserPromise;
      browserPromise = null;
      if (pending !== null) await pending.then((browser) => browser.close());
    },
  };
}

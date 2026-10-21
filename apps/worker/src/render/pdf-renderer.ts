import { createValidationIssue, err, ok, type Result, type ValidationIssue } from "@gizito/core";
import { PDFDocument } from "pdf-lib";
import { type Browser, type BrowserContext, chromium } from "playwright";
import type { KitItemAttribute, RenderDocument } from "#src/render/document.ts";
import { createSemaphore } from "#src/render/semaphore.ts";

export const DEFAULT_RENDER_TIMEOUT_MS = 30_000;

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const SIDE_MARGIN_MM = 16;
const CSS_PX_PER_MM = 96 / 25.4;
const CONTENT_WIDTH_PX = Math.floor((A4_WIDTH_MM - 2 * SIDE_MARGIN_MM) * CSS_PX_PER_MM);
const PAGE_HEIGHT_PX = Math.floor(A4_HEIGHT_MM * CSS_PX_PER_MM);
const PAGE_MARGIN = {
  top: "18mm",
  right: `${SIDE_MARGIN_MM}mm`,
  bottom: "16mm",
  left: `${SIDE_MARGIN_MM}mm`,
} as const;

export type RenderedPdf = {
  readonly bytes: Uint8Array;
  readonly pageCount: number;
};

export type PdfRenderFailure = {
  readonly issueList: readonly ValidationIssue[];
  readonly errorName: string | null;
};

export type PdfRenderer = {
  readonly render: (document: RenderDocument) => Promise<Result<RenderedPdf, PdfRenderFailure>>;
  readonly close: () => Promise<void>;
};

export type PdfRendererOption = {
  readonly concurrency: number;
  readonly timeoutMs?: number;
};

type DomItemReport = {
  readonly itemId: string;
  readonly isVisible: boolean;
  readonly isOverflowing: boolean;
};

export function errorNameOf(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

export class RenderTimeoutError extends Error {
  override readonly name = "RenderTimeoutError";
}

function inspectKitItemList(attribute: KitItemAttribute): DomItemReport[] {
  const contentRight = document.documentElement.clientWidth;
  const clipValueList = ["hidden", "clip", "scroll", "auto"];
  function isClipping(node: Element): boolean {
    if (node.closest(".katex") !== null) return false;
    const style = getComputedStyle(node);
    const clipsX =
      clipValueList.includes(style.overflowX) && node.scrollWidth > node.clientWidth + 1;
    const clipsY =
      clipValueList.includes(style.overflowY) && node.scrollHeight > node.clientHeight + 1;
    return clipsX || clipsY;
  }
  function isOutsidePage(node: Element): boolean {
    const box = node.getBoundingClientRect();
    return box.width > 0 && (box.right > contentRight + 0.5 || box.left < -0.5);
  }
  return [...document.querySelectorAll(`[${attribute}]`)].map((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const nodeList = [element, ...element.querySelectorAll("*")];
    return {
      itemId: element.getAttribute(attribute) ?? "",
      isVisible:
        box.width > 0 &&
        box.height > 0 &&
        style.visibility === "visible" &&
        (element.textContent ?? "").trim() !== "",
      isOverflowing: nodeList.some((node) => isOutsidePage(node) || isClipping(node)),
    };
  });
}

function issueListOf(
  reportList: readonly DomItemReport[],
  expectedItemIdList: readonly string[],
): ValidationIssue[] {
  return expectedItemIdList.flatMap((itemId) => {
    const matchList = reportList.filter((report) => report.itemId === itemId);
    const [report] = matchList;
    if (report === undefined || matchList.length > 1 || !report.isVisible) {
      return [createValidationIssue("render_item_missing", { itemId })];
    }
    return report.isOverflowing ? [createValidationIssue("render_overflow", { itemId })] : [];
  });
}

async function convertToPdf(
  context: BrowserContext,
  renderDocument: RenderDocument,
  timeoutMs: number,
): Promise<Result<RenderedPdf, PdfRenderFailure>> {
  await context.route("**/*", (route) => route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  await page.emulateMedia({ media: "print" });
  await page.setContent(renderDocument.html, { waitUntil: "load" });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const reportList = await page.evaluate(inspectKitItemList, renderDocument.itemAttribute);
  const issueList = issueListOf(reportList, renderDocument.expectedItemIdList);
  if (issueList.length > 0) return err({ issueList, errorName: null });
  const pdf = await page.pdf({
    format: "A4",
    printBackground: false,
    displayHeaderFooter: true,
    headerTemplate: renderDocument.headerHtml,
    footerTemplate: renderDocument.footerHtml,
    margin: PAGE_MARGIN,
  });
  const pdfDocument = await PDFDocument.load(pdf, { updateMetadata: false });
  return ok({ bytes: new Uint8Array(pdf), pageCount: pdfDocument.getPageCount() });
}

async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new RenderTimeoutError()), timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function createPdfRenderer({
  concurrency,
  timeoutMs = DEFAULT_RENDER_TIMEOUT_MS,
}: PdfRendererOption): PdfRenderer {
  const semaphore = createSemaphore(concurrency);
  let browserPromise: Promise<Browser> | null = null;

  function sharedBrowser(): Promise<Browser> {
    browserPromise ??= chromium.launch({ headless: true }).then(
      (browser) => {
        browser.on("disconnected", () => {
          browserPromise = null;
        });
        return browser;
      },
      (error: unknown) => {
        browserPromise = null;
        throw error;
      },
    );
    return browserPromise;
  }

  async function renderOnce(
    renderDocument: RenderDocument,
  ): Promise<Result<RenderedPdf, PdfRenderFailure>> {
    const browser = await withTimeout(sharedBrowser(), timeoutMs);
    const context = await browser.newContext({
      javaScriptEnabled: false,
      offline: true,
      viewport: { width: CONTENT_WIDTH_PX, height: PAGE_HEIGHT_PX },
    });
    try {
      return await withTimeout(convertToPdf(context, renderDocument, timeoutMs), timeoutMs);
    } finally {
      await context.close();
    }
  }

  return {
    render: (renderDocument) =>
      semaphore.run(async () => {
        try {
          return await renderOnce(renderDocument);
        } catch (error) {
          return err({
            issueList: [createValidationIssue("render_failed")],
            errorName: errorNameOf(error),
          });
        }
      }),
    async close() {
      const pending = browserPromise;
      browserPromise = null;
      if (pending !== null) await (await pending).close();
    },
  };
}

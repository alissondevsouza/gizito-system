import { afterAll, describe, expect, it } from "bun:test";
import {
  ACTIVITIES_PAGE_RANGE,
  ANSWER_KEY_PAGE_RANGE,
  type MathStudyKit,
  type Subject,
} from "@gizito/core";
import { type Browser, chromium } from "playwright";
import {
  FIXED_GENERATED_AT,
  loadRealStudyKit,
} from "#src/__tests__/render/__fixtures__/study-kit.ts";
import type { RenderDocument } from "#src/render/document.ts";
import { createPdfRenderer } from "#src/render/pdf-renderer.ts";
import { renderKit } from "#src/render/render-kit.ts";

const pdfRenderer = createPdfRenderer({ concurrency: 2 });

afterAll(async () => {
  await pdfRenderer.close();
});

function pdfText(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes);
}

function plainDocument(
  body: string,
  expectedItemIdList: readonly string[] = ["p1", "p2"],
): RenderDocument {
  return {
    html: `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`,
    headerHtml: "<span></span>",
    footerHtml: "<span></span>",
    itemAttribute: "data-kit-item",
    expectedItemIdList,
  };
}

function createSpiedLauncher() {
  const browserList: Browser[] = [];
  let activeContextCount = 0;
  let maxActiveContextCount = 0;
  async function launchBrowser(): Promise<Browser> {
    const browser = await chromium.launch({ headless: true });
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (option) => {
      const context = await newContext(option);
      activeContextCount += 1;
      maxActiveContextCount = Math.max(maxActiveContextCount, activeContextCount);
      context.on("close", () => {
        activeContextCount -= 1;
      });
      return context;
    };
    browserList.push(browser);
    return browser;
  }
  return { launchBrowser, browserList, maxActiveContextCount: () => maxActiveContextCount };
}

const busyBody = `<p data-kit-item="p1">um</p>${"<p>linha de preenchimento</p>".repeat(3000)}`;

async function loadRealMathKit(): Promise<MathStudyKit> {
  const studyKit = await loadRealStudyKit("math");
  if (studyKit.subject !== "math") throw new Error("fixture de Matemática");
  return studyKit;
}

describe("renderKit com Chromium real (spec F1-08, RF-05 a RF-07)", () => {
  it.each(["math", "portuguese"] satisfies Subject[])(
    "%s: dois PDFs com todos os itens, fontes embutidas e páginas na faixa",
    async (subject) => {
      const studyKit = await loadRealStudyKit(subject);
      const result = await renderKit(
        { studyKit, generatedAt: FIXED_GENERATED_AT },
        { pdfRenderer },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const { activities, answerKey, warningList } = result.value;
      for (const file of [activities, answerKey]) {
        expect(pdfText(file.bytes.slice(0, 5))).toBe("%PDF-");
        expect(pdfText(file.bytes)).toContain("NunitoSans");
        expect(file.attemptCount).toBe(1);
      }
      for (const file of [activities, answerKey]) {
        expect(pdfText(file.bytes).includes("KaTeX_Main")).toBe(subject === "math");
      }
      expect(activities.pageCount).toBeGreaterThanOrEqual(ACTIVITIES_PAGE_RANGE.min);
      expect(activities.pageCount).toBeLessThanOrEqual(ACTIVITIES_PAGE_RANGE.max);
      expect(answerKey.pageCount).toBeGreaterThanOrEqual(ANSWER_KEY_PAGE_RANGE.min);
      expect(answerKey.pageCount).toBeLessThanOrEqual(ANSWER_KEY_PAGE_RANGE.max);
      expect(warningList).toEqual([]);
    },
  );

  it("palavra longa sem espaço, tabela larga e fórmula longa não estouram a página", async () => {
    const studyKit = await loadRealMathKit();
    const [first, second, third, ...rest] = studyKit.practiceQuestionList;
    if (first === undefined || second === undefined || third === undefined)
      throw new Error("fixture curta");
    const longSum = Array.from(
      { length: 40 },
      (_, index) => `\\frac{${index + 1}}{${index + 2}}`,
    ).join(" + ");
    const wideCell = "x".repeat(40);
    const hostileKit: MathStudyKit = {
      ...studyKit,
      practiceQuestionList: [
        { ...first, statement: `Leia ${"a".repeat(300)} e responda.` },
        {
          ...second,
          table: { headerList: Array(6).fill(wideCell), rowList: [Array(6).fill(wideCell)] },
        },
        { ...third, statement: `Calcule \\(${longSum}\\).` },
        ...rest,
      ],
    };
    const result = await renderKit(
      { studyKit: hostileKit, generatedAt: FIXED_GENERATED_AT },
      { pdfRenderer },
    );
    expect(
      result.ok ? [] : result.error.issueList.map((issue) => `${issue.code}:${issue.itemId}`),
    ).toEqual([]);
  });
});

describe("conferência do DOM (spec F1-08, RF-06)", () => {
  it("documento com os itens visíveis vira PDF de uma página", async () => {
    const result = await pdfRenderer.render(
      plainDocument('<p data-kit-item="p1">um</p><p data-kit-item="p2">dois</p>'),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pageCount).toBe(1);
  });

  it.each([
    ["ausente", '<p data-kit-item="p1">um</p>'],
    [
      "duplicado",
      '<p data-kit-item="p1">um</p><p data-kit-item="p2">a</p><p data-kit-item="p2">b</p>',
    ],
    [
      "com display none",
      '<p data-kit-item="p1">um</p><p data-kit-item="p2" style="display:none">dois</p>',
    ],
    [
      "com visibility hidden",
      '<p data-kit-item="p1">um</p><p data-kit-item="p2" style="visibility:hidden">dois</p>',
    ],
    ["sem texto", '<p data-kit-item="p1">um</p><p data-kit-item="p2" style="height:20px"> </p>'],
  ])("item %s dá render_item_missing com o itemId", async (_case, body) => {
    const result = await pdfRenderer.render(plainDocument(body));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.issueList.map((issue) => [issue.code, issue.itemId])).toEqual([
      ["render_item_missing", "p2"],
    ]);
  });

  it.each([
    [
      "mais largo que a página",
      '<div data-kit-item="p2"><div style="width:2000px">dois</div></div>',
    ],
    ["fora da página à esquerda", '<div data-kit-item="p2" style="margin-left:-50px">dois</div>'],
    [
      "cortado por overflow",
      `<div data-kit-item="p2" style="height:12px;overflow:hidden">${"linha ".repeat(200)}</div>`,
    ],
  ])("item %s dá render_overflow com o itemId", async (_case, body) => {
    const result = await pdfRenderer.render(plainDocument(`<p data-kit-item="p1">um</p>${body}`));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.issueList.map((issue) => [issue.code, issue.itemId])).toEqual([
      ["render_overflow", "p2"],
    ]);
  });
});

describe("browser, rede e tempo (spec F1-08, RF-04 e RF-05)", () => {
  it("nenhuma requisição de rede sai do documento", async () => {
    let requestCount = 0;
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => {
        requestCount += 1;
        return new Response("x");
      },
    });
    try {
      const origin = `http://127.0.0.1:${server.port}`;
      const result = await pdfRenderer.render(
        plainDocument(
          `<link rel="stylesheet" href="${origin}/a.css"><img src="${origin}/b.png" alt=""><p data-kit-item="p1" style="background:url(${origin}/c.png)">um</p><p data-kit-item="p2">dois</p>`,
        ),
      );
      expect(result.ok).toBe(true);
      expect(requestCount).toBe(0);
    } finally {
      await server.stop(true);
    }
  });

  it("estouro do tempo vira render_failed com o nome do erro", async () => {
    const slowRenderer = createPdfRenderer({ concurrency: 1, timeoutMs: 1 });
    try {
      const result = await slowRenderer.render(
        plainDocument('<p data-kit-item="p1">um</p>', ["p1"]),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.issueList.map((issue) => issue.code)).toEqual(["render_failed"]);
      expect(result.error.errorName).toBe("RenderTimeoutError");
    } finally {
      await slowRenderer.close();
    }
  });

  it.each([
    [1, 1],
    [2, 2],
  ])(
    "com concurrency %i, no máximo %i documentos abertos ao mesmo tempo",
    async (concurrency, expected) => {
      const spied = createSpiedLauncher();
      const renderer = createPdfRenderer({ concurrency, launchBrowser: spied.launchBrowser });
      try {
        const document = plainDocument(busyBody, ["p1"]);
        const resultList = await Promise.all([
          renderer.render(document),
          renderer.render(document),
        ]);
        expect(resultList.every((result) => result.ok)).toBe(true);
        expect(spied.maxActiveContextCount()).toBe(expected);
      } finally {
        await renderer.close();
      }
    },
  );

  it("estouro do tempo na conversão descarta o browser, libera a vaga e o próximo render relança", async () => {
    const spied = createSpiedLauncher();
    const renderer = createPdfRenderer({
      concurrency: 1,
      timeoutMs: 5000,
      launchBrowser: spied.launchBrowser,
    });
    try {
      const small = plainDocument('<p data-kit-item="p1">um</p>', ["p1"]);
      expect((await renderer.render(small)).ok).toBe(true);
      const heavy = plainDocument(
        `<p data-kit-item="p1">um</p>${"<p>linha de preenchimento</p>".repeat(100_000)}`,
        ["p1"],
      );
      const timedOut = await renderer.render(heavy);
      expect(timedOut.ok).toBe(false);
      if (timedOut.ok) return;
      expect(timedOut.error.errorName).toBe("RenderTimeoutError");
      expect((await renderer.render(small)).ok).toBe(true);
      expect(spied.browserList).toHaveLength(2);
    } finally {
      await renderer.close();
    }
  }, 30_000);

  it("browser que cai entre renders é relançado no render seguinte", async () => {
    const spied = createSpiedLauncher();
    const renderer = createPdfRenderer({ concurrency: 1, launchBrowser: spied.launchBrowser });
    try {
      const document = plainDocument('<p data-kit-item="p1">um</p>', ["p1"]);
      expect((await renderer.render(document)).ok).toBe(true);
      await spied.browserList[0]?.close();
      expect((await renderer.render(document)).ok).toBe(true);
      expect(spied.browserList).toHaveLength(2);
    } finally {
      await renderer.close();
    }
  }, 30_000);

  it("relança o browser depois de close()", async () => {
    const renderer = createPdfRenderer({ concurrency: 1 });
    const document = plainDocument('<p data-kit-item="p1">um</p>', ["p1"]);
    expect((await renderer.render(document)).ok).toBe(true);
    await renderer.close();
    expect((await renderer.render(document)).ok).toBe(true);
    await renderer.close();
  });
});

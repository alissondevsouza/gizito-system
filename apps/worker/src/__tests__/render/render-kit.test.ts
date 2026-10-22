import { beforeAll, describe, expect, it } from "bun:test";
import {
  ACTIVITIES_PAGE_RANGE,
  ANSWER_KEY_PAGE_RANGE,
  createValidationIssue,
  err,
  type MathStudyKit,
  ok,
  type Result,
  type StudyKit,
} from "@gizito/core";
import {
  FIXED_GENERATED_AT,
  loadRealStudyKit,
} from "#src/__tests__/render/__fixtures__/study-kit.ts";
import type { RenderDocument } from "#src/render/document.ts";
import type { PdfRenderer, PdfRenderFailure, RenderedPdf } from "#src/render/pdf-renderer.ts";
import { renderKit } from "#src/render/render-kit.ts";

type RenderOutcome = Result<RenderedPdf, PdfRenderFailure>;
type OutcomeByAttribute = Readonly<
  Record<RenderDocument["itemAttribute"], readonly RenderOutcome[]>
>;

function rendered(pageCount: number): RenderOutcome {
  return ok({ bytes: new TextEncoder().encode("%PDF-1.7"), pageCount });
}

const timedOut: RenderOutcome = err({
  issueList: [createValidationIssue("render_failed")],
  errorName: "RenderTimeoutError",
});

function createScriptedRenderer(outcomeByAttribute: OutcomeByAttribute) {
  const callList: RenderDocument[] = [];
  const pdfRenderer: PdfRenderer = {
    async render(document) {
      const attemptIndex = callList.filter(
        (call) => call.itemAttribute === document.itemAttribute,
      ).length;
      callList.push(document);
      const outcomeList = outcomeByAttribute[document.itemAttribute];
      const outcome = outcomeList[Math.min(attemptIndex, outcomeList.length - 1)];
      if (outcome === undefined) throw new Error("roteiro vazio");
      return outcome;
    },
    async close() {},
  };
  return { pdfRenderer, callList };
}

let studyKit: StudyKit;

beforeAll(async () => {
  studyKit = await loadRealStudyKit("math");
});

describe("renderKit (spec F1-08, RF-07)", () => {
  it("devolve os dois PDFs com páginas e tentativas, sem aviso dentro da faixa", async () => {
    const { pdfRenderer, callList } = createScriptedRenderer({
      "data-kit-item": [rendered(ACTIVITIES_PAGE_RANGE.min)],
      "data-kit-answer": [rendered(ANSWER_KEY_PAGE_RANGE.max)],
    });
    const result = await renderKit({ studyKit, generatedAt: FIXED_GENERATED_AT }, { pdfRenderer });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.activities).toMatchObject({
      pageCount: ACTIVITIES_PAGE_RANGE.min,
      attemptCount: 1,
    });
    expect(result.value.answerKey).toMatchObject({
      pageCount: ANSWER_KEY_PAGE_RANGE.max,
      attemptCount: 1,
    });
    expect(result.value.warningList).toEqual([]);
    expect(callList.map((call) => call.itemAttribute).sort()).toEqual([
      "data-kit-answer",
      "data-kit-item",
    ]);
  });

  it("refaz o arquivo que falhou uma vez e entrega com duas tentativas", async () => {
    const { pdfRenderer, callList } = createScriptedRenderer({
      "data-kit-item": [rendered(10)],
      "data-kit-answer": [timedOut, rendered(5)],
    });
    const result = await renderKit({ studyKit, generatedAt: FIXED_GENERATED_AT }, { pdfRenderer });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.activities.attemptCount).toBe(1);
    expect(result.value.answerKey.attemptCount).toBe(2);
    expect(callList).toHaveLength(3);
  });

  it("falha com render_failed quando um dos dois falha nas duas tentativas, sem PDF", async () => {
    const missing = err({
      issueList: [createValidationIssue("render_item_missing", { itemId: "m3" })],
      errorName: null,
    });
    const { pdfRenderer, callList } = createScriptedRenderer({
      "data-kit-item": [missing],
      "data-kit-answer": [rendered(5)],
    });
    const result = await renderKit({ studyKit, generatedAt: FIXED_GENERATED_AT }, { pdfRenderer });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("render_failed");
    expect(result.error.issueList.map((issue) => [issue.code, issue.itemId, issue.stage])).toEqual([
      ["render_item_missing", "m3", "render"],
    ]);
    expect(result.error.errorNameList).toEqual([]);
    expect(callList.filter((call) => call.itemAttribute === "data-kit-item")).toHaveLength(2);
    expect(result.error).not.toHaveProperty("activities");
  });

  it("junta os issues e os nomes de erro dos dois arquivos", async () => {
    const { pdfRenderer } = createScriptedRenderer({
      "data-kit-item": [timedOut],
      "data-kit-answer": [timedOut],
    });
    const result = await renderKit({ studyKit, generatedAt: FIXED_GENERATED_AT }, { pdfRenderer });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.issueList.map((issue) => issue.code)).toEqual([
      "render_failed",
      "render_failed",
    ]);
    expect(result.error.errorNameList).toEqual(["RenderTimeoutError", "RenderTimeoutError"]);
  });

  it("sem segunda tentativa quando retryCount é 0", async () => {
    const { pdfRenderer, callList } = createScriptedRenderer({
      "data-kit-item": [timedOut, rendered(10)],
      "data-kit-answer": [rendered(5)],
    });
    const result = await renderKit(
      { studyKit, generatedAt: FIXED_GENERATED_AT },
      { pdfRenderer, retryCount: 0 },
    );
    expect(result.ok).toBe(false);
    expect(callList).toHaveLength(2);
  });

  it.each([
    [ACTIVITIES_PAGE_RANGE.max + 1, ANSWER_KEY_PAGE_RANGE.min],
    [ACTIVITIES_PAGE_RANGE.min - 1, ANSWER_KEY_PAGE_RANGE.min],
    [ACTIVITIES_PAGE_RANGE.min, ANSWER_KEY_PAGE_RANGE.max + 1],
    [ACTIVITIES_PAGE_RANGE.min, ANSWER_KEY_PAGE_RANGE.min - 1],
  ])(
    "atividades com %i e gabarito com %i páginas dão aviso, sem falhar",
    async (activityPageCount, answerKeyPageCount) => {
      const { pdfRenderer } = createScriptedRenderer({
        "data-kit-item": [rendered(activityPageCount)],
        "data-kit-answer": [rendered(answerKeyPageCount)],
      });
      const result = await renderKit(
        { studyKit, generatedAt: FIXED_GENERATED_AT },
        { pdfRenderer },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.warningList).toEqual([createValidationIssue("page_count_out_of_range")]);
      expect(result.value.warningList[0]?.severity).toBe("warning");
    },
  );

  it("template que lança vira render_failed sem chamar o renderer", async () => {
    const { pdfRenderer, callList } = createScriptedRenderer({
      "data-kit-item": [rendered(10)],
      "data-kit-answer": [rendered(5)],
    });
    if (studyKit.subject !== "math") throw new Error("fixture de Matemática");
    const [first, ...rest] = studyKit.practiceQuestionList;
    if (first === undefined) throw new Error("fixture sem questão");
    const brokenKit: MathStudyKit = {
      ...studyKit,
      practiceQuestionList: [{ ...first, statement: "Calcule \\(\\frac{1}{\\) agora." }, ...rest],
    };
    const result = await renderKit(
      { studyKit: brokenKit, generatedAt: FIXED_GENERATED_AT },
      { pdfRenderer },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.issueList.map((issue) => issue.code)).toEqual(["render_failed"]);
    expect(result.error.errorNameList).toEqual(["ParseError"]);
    expect(callList).toHaveLength(0);
  });
});

describe("renderKit com a marca de amostra (spec F1-11, RF-01)", () => {
  it.each([
    [true, true],
    [undefined, false],
  ] as const)(
    "com isSample %p, a marca aparece nos dois documentos: %p",
    async (isSample, hasMark) => {
      const { pdfRenderer, callList } = createScriptedRenderer({
        "data-kit-item": [rendered(ACTIVITIES_PAGE_RANGE.min)],
        "data-kit-answer": [rendered(ANSWER_KEY_PAGE_RANGE.min)],
      });
      const result = await renderKit(
        { studyKit, generatedAt: FIXED_GENERATED_AT, isSample },
        { pdfRenderer },
      );
      expect(result.ok).toBe(true);
      expect(callList).toHaveLength(2);
      for (const document of callList) {
        expect(document.html.includes('class="sample-mark"')).toBe(hasMark);
        expect(document.footerHtml.includes("Kit de amostra")).toBe(hasMark);
      }
    },
  );
});

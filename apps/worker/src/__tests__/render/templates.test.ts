import { beforeAll, describe, expect, it } from "bun:test";
import {
  listAnswerKey,
  listStudyQuestion,
  type PortugueseStudyKit,
  questionIdList,
  type StudyKit,
  workedExampleIdList,
} from "@gizito/core";
import { buildMathFixture, buildPortugueseFixture } from "@gizito/core/testing";
import {
  FIXED_GENERATED_AT,
  listHtmlOutline,
  listParsedElement,
  loadRealStudyKit,
} from "#src/__tests__/render/__fixtures__/study-kit.ts";
import { loadRenderAssets, type RenderAssets } from "#src/render/assets.ts";
import { expectedAnswerHtml, kitTextHtml } from "#src/render/kit-text.ts";
import { kitTemplateMap } from "#src/render/templates/index.ts";
import { AI_NOTE_TEXT, formatKitDate } from "#src/render/templates/kit-v1/common.ts";

let assets: RenderAssets;
let realMathKit: StudyKit;
let realPortugueseKit: StudyKit;

beforeAll(async () => {
  assets = await loadRenderAssets();
  realMathKit = await loadRealStudyKit("math");
  realPortugueseKit = await loadRealStudyKit("portuguese");
});

const template = kitTemplateMap["kit-v1"];

function documentPairOf(studyKit: StudyKit) {
  const context = { assets, generatedAt: FIXED_GENERATED_AT };
  return {
    activities: template.activities(studyKit, context),
    answerKey: template.answerKey(studyKit, context),
  };
}

function sectionHtml(documentHtml: string, section: string): string {
  const start = documentHtml.indexOf(`data-section="${section}"`);
  const end = documentHtml.indexOf("<section", start);
  return documentHtml.slice(start, end === -1 ? undefined : end);
}

function withHostileStatement(studyKit: PortugueseStudyKit): PortugueseStudyKit {
  const [first, ...rest] = studyKit.practiceQuestionList;
  if (first === undefined) throw new Error("fixture sem questão");
  const hostileOptionList =
    first.optionList === null
      ? null
      : first.optionList.map((option) => ({ ...option, text: '<img src=x onerror="alert(1)">' }));
  return {
    ...studyKit,
    topicList: studyKit.topicList.map((topic) => ({
      ...topic,
      label: `${topic.label} <script>x</script>`,
    })),
    practiceQuestionList: [
      {
        ...first,
        statement: '<script>alert(1)</script> & "aspas" <a href="https://exemplo.com">link</a>',
        optionList: hostileOptionList,
      },
      ...rest,
    ],
  };
}

describe("snapshot estrutural do kit-v1 (spec F1-08, RF-02 e RF-03)", () => {
  it.each([
    ["Matemática", () => buildMathFixture().studyKit],
    ["Português", () => buildPortugueseFixture().studyKit],
  ] as const)("%s: seções, itens e títulos dos dois documentos", async (_subject, build) => {
    const pair = documentPairOf(build());
    expect({
      activities: await listHtmlOutline(pair.activities.html),
      answerKey: await listHtmlOutline(pair.answerKey.html),
    }).toMatchSnapshot();
  });
});

describe("texto do kit nunca vira HTML (spec F1-08, RF-01)", () => {
  it("nenhum script, atributo de evento ou link sai do texto do kit nos dois documentos", async () => {
    const pair = documentPairOf(withHostileStatement(buildPortugueseFixture().studyKit));
    for (const document of [pair.activities, pair.answerKey]) {
      const elementList = await listParsedElement(document.html);
      expect(elementList.some((element) => element.tagName === "script")).toBe(false);
      expect(elementList.some((element) => element.tagName === "a")).toBe(false);
      expect(
        elementList.some((element) =>
          element.attributeNameList.some((name) => name.startsWith("on")),
        ),
      ).toBe(false);
      expect(document.headerHtml).not.toContain("<script");
    }
    expect(pair.activities.html).toContain(
      "&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;aspas&quot;",
    );
  });
});

describe("caderno de atividades (spec F1-08, RF-02)", () => {
  it("lista os 22 itens esperados no atributo do caderno", async () => {
    const { activities } = documentPairOf(realMathKit);
    expect(activities.itemAttribute).toBe("data-kit-item");
    expect(activities.expectedItemIdList).toEqual([...workedExampleIdList, ...questionIdList]);
    const outline = await listHtmlOutline(activities.html);
    expect(outline.filter((line) => line.startsWith("item:"))).toEqual(
      [...workedExampleIdList, ...questionIdList].map((itemId) => `item:${itemId}`),
    );
  });

  it("capa com disciplina, ano, assuntos, data, mascote e nota de IA, sem outro dado do pedido", () => {
    const cover = sectionHtml(documentPairOf(realMathKit).activities.html, "cover");
    expect(cover).toContain('Meu reforço de <span class="cover-subject">Matemática</span>');
    expect(cover).toContain("5º ano");
    for (const topic of realMathKit.topicList)
      expect(cover).toContain(kitTextHtml(topic.label).value);
    expect(cover).toContain(`Gerado em ${formatKitDate(FIXED_GENERATED_AT)}`);
    expect(cover).toContain(assets.mascotDataUrlMap.hello);
    expect(cover).toContain(AI_NOTE_TEXT);
    expect(formatKitDate(new Date("2026-10-21T02:30:00.000Z"))).toBe("20/10/2026");
  });

  it("não traz nota da revisão, perfil do material nem versão do pipeline", () => {
    const { activities, answerKey } = documentPairOf(realMathKit);
    const reviewNoteList = realMathKit.qualityCheckList.flatMap((issue) =>
      issue.note === null ? [] : [issue.note],
    );
    expect(reviewNoteList.length).toBeGreaterThan(0);
    for (const html of [activities.html, answerKey.html]) {
      for (const note of reviewNoteList) expect(html).not.toContain(kitTextHtml(note).value);
      expect(html).not.toContain(realMathKit.generationVersion);
      expect(html).not.toContain(realMathKit.taxonomyVersion);
    }
  });

  it("não mostra resposta de questão no caderno", () => {
    const { activities } = documentPairOf(realMathKit);
    for (const question of listStudyQuestion(realMathKit)) {
      expect(activities.html).not.toContain(kitTextHtml(question.answer.explanation).value);
      for (const step of question.answer.solutionStepList) {
        expect(activities.html).not.toContain(`<li>${kitTextHtml(step).value}</li>`);
      }
    }
  });

  it("escreve a alternativa de Matemática a partir do value", () => {
    if (realMathKit.subject !== "math") throw new Error("fixture de Matemática");
    const { activities } = documentPairOf(realMathKit);
    for (const question of realMathKit.practiceQuestionList) {
      for (const option of question.optionList ?? []) {
        expect(activities.html).toContain(
          `<span class="option-label">${option.label}</span><span>${expectedAnswerHtml(option.value).value}</span>`,
        );
      }
    }
  });

  it("simulado com cabeçalho de prova e tempo sugerido, sem dica nem mascote", () => {
    const { activities } = documentPairOf(realMathKit);
    const mock = sectionHtml(activities.html, "mock");
    expect(mock).toContain("Nome:");
    expect(mock).toContain("Data:");
    expect(mock).toContain(`${realMathKit.mockSuggestedMinutes} minutos`);
    expect(mock).not.toContain(kitTextHtml(realMathKit.studyTip).value);
    expect(mock).not.toContain("<img");
    expect(activities.html.split(kitTextHtml(realMathKit.studyTip).value)).toHaveLength(2);
    expect(sectionHtml(activities.html, "tip")).toContain(assets.mascotDataUrlMap.point);
  });

  it("põe o texto-base no bloco das questões que o citam", async () => {
    const studyKit = buildPortugueseFixture().studyKit;
    const outline = await listHtmlOutline(documentPairOf(studyKit).activities.html);
    const sectionOf = (line: string) =>
      outline
        .slice(0, outline.indexOf(line))
        .filter((entry) => entry.startsWith("section:"))
        .at(-1);
    for (const baseText of studyKit.baseTextList) {
      expect(sectionOf(`base-text:${baseText.baseTextId}`)).toBe(`section:${baseText.block}`);
    }
  });

  it("espaço de resposta: cálculo em Matemática, linhas na aberta de Português", () => {
    const mathPractice = sectionHtml(documentPairOf(realMathKit).activities.html, "practice");
    expect(mathPractice.split('class="work-space').length - 1).toBe(10);
    const portugueseKit = realPortugueseKit;
    const openCount = listStudyQuestion(portugueseKit).filter(
      (question) => question.optionList === null,
    ).length;
    expect(
      documentPairOf(portugueseKit).activities.html.split('class="writing-lines"').length - 1,
    ).toBe(openCount);
  });
});

describe("gabarito (spec F1-08, RF-03)", () => {
  it("20 respostas na ordem de listAnswerKey, com o número do bloco", async () => {
    const { answerKey } = documentPairOf(realMathKit);
    expect(answerKey.itemAttribute).toBe("data-kit-answer");
    expect(answerKey.expectedItemIdList).toEqual(questionIdList);
    const outline = await listHtmlOutline(answerKey.html);
    expect(outline.filter((line) => line.startsWith("answer:"))).toEqual(
      listAnswerKey(realMathKit).map((entry) => `answer:${entry.questionId}`),
    );
    expect(outline).toContain("h1:Exercícios de fixação");
    expect(outline).toContain("h1:Mini-simulado");
  });

  it("letra e alternativa certa formatada na múltipla escolha, resposta formatada na aberta", () => {
    const { answerKey } = documentPairOf(realMathKit);
    for (const entry of listAnswerKey(realMathKit)) {
      const expected =
        entry.correctOption === null
          ? `Resposta: ${expectedAnswerHtml(entry.answer.expectedAnswer).value}`
          : `Alternativa ${entry.correctOption.label}: ${
              "text" in entry.correctOption
                ? kitTextHtml(entry.correctOption.text).value
                : expectedAnswerHtml(entry.correctOption.value).value
            }`;
      expect(answerKey.html).toContain(`<p class="answer-main">${expected}</p>`);
    }
    expect(answerKey.html).toContain("mfrac");
  });

  it("respostas aceitas, etapas, explicação e trecho citado com o título do texto", () => {
    const { answerKey } = documentPairOf(realPortugueseKit);
    for (const entry of listAnswerKey(realPortugueseKit)) {
      expect(answerKey.html).toContain(kitTextHtml(entry.answer.explanation).value);
      const answer = entry.answer.expectedAnswer;
      if (answer.kind === "text") {
        for (const accepted of answer.acceptedList) {
          expect(answerKey.html).toContain(`<li>${kitTextHtml(accepted).value}</li>`);
        }
      }
      if (entry.answer.evidenceQuote !== null) {
        expect(answerKey.html).toContain(`“${kitTextHtml(entry.answer.evidenceQuote).value}”`);
      }
    }
    const baseTitle = realPortugueseKit.baseTextList[0]?.title ?? "";
    expect(answerKey.html).toContain(`Trecho do texto “${kitTextHtml(baseTitle).value}”:`);
  });

  it("capa do gabarito com os mesmos identificadores, mascote de sucesso e nota de IA", () => {
    const cover = sectionHtml(documentPairOf(realPortugueseKit).answerKey.html, "cover");
    expect(cover).toContain('Gabarito de <span class="cover-subject">Língua Portuguesa</span>');
    expect(cover).toContain("7º ano");
    expect(cover).toContain(assets.mascotDataUrlMap.success);
    expect(cover).toContain("Para o responsável conferir depois que a criança resolver.");
    expect(cover).toContain(`Gerado em ${formatKitDate(FIXED_GENERATED_AT)}`);
    for (const topic of realPortugueseKit.topicList)
      expect(cover).toContain(kitTextHtml(topic.label).value);
    expect(cover).toContain(AI_NOTE_TEXT);
  });
});

describe("cabeçalho e rodapé (spec F1-08, RF-04)", () => {
  it("cabeçalho com Gizito, disciplina, ano e assuntos; rodapé com o arquivo e a página", () => {
    const { activities, answerKey } = documentPairOf(realMathKit);
    expect(activities.headerHtml).toContain("Gizito");
    expect(activities.headerHtml).toContain("Matemática · 5º ano");
    expect(activities.headerHtml).toContain(
      realMathKit.topicList.map((topic) => topic.label).join(", "),
    );
    expect(activities.footerHtml).toContain("Atividades");
    expect(answerKey.footerHtml).toContain("Gabarito");
    for (const marginal of [activities.footerHtml, answerKey.footerHtml]) {
      expect(marginal).toContain('<span class="pageNumber"></span>');
      expect(marginal).toContain('<span class="totalPages"></span>');
    }
  });
});

import {
  gradeLabelMap,
  type MathOption,
  MOCK_QUESTION_COUNT,
  type PortugueseOption,
  PRACTICE_QUESTION_COUNT,
  type QuestionBlock,
  questionIdList,
  type StudyKit,
  type StudyQuestion,
  type StudyWorkedExample,
  subjectLabelMap,
  WORKED_EXAMPLE_COUNT,
  workedExampleIdList,
} from "@gizito/core";
import type { RenderDocument } from "#src/render/document.ts";
import { html, type SafeHtml } from "#src/render/html.ts";
import { expectedAnswerHtml, kitTextHtml } from "#src/render/kit-text.ts";
import {
  aiNoteHtml,
  baseTextHtml,
  baseTextTitleOf,
  blockTitleMap,
  documentHtml,
  footerHtml,
  generatedDateHtml,
  headerHtml,
  type KitTemplateContext,
  kitTableHtml,
  topicListHtml,
} from "#src/render/templates/kit-v1/common.ts";

const PORTUGUESE_WRITING_LINE_COUNT = 4;

function coverHtml(studyKit: StudyKit, context: KitTemplateContext): SafeHtml {
  return html`<section class="cover" data-section="cover">
<p class="brand">Gizito</p>
<div class="cover-main">
<div class="cover-text">
<h1>Meu reforço de <span class="cover-subject">${subjectLabelMap[studyKit.subject]}</span></h1>
<p class="cover-grade">${gradeLabelMap[studyKit.grade]}</p>
<h2>Assuntos</h2>
${topicListHtml(studyKit)}
</div>
<img class="cover-mascot" alt="" src="${context.assets.mascotDataUrlMap.hello}">
</div>
<div class="cover-box">
<h2>O que tem neste caderno</h2>
<ul>
<li>Revisão dos assuntos</li>
<li>${WORKED_EXAMPLE_COUNT} exemplos resolvidos passo a passo</li>
<li>${PRACTICE_QUESTION_COUNT} exercícios de fixação</li>
<li>Mini-simulado com ${MOCK_QUESTION_COUNT} questões</li>
</ul>
<p>As respostas comentadas estão no outro arquivo, o gabarito.</p>
</div>
${generatedDateHtml(context.generatedAt)}
${aiNoteHtml()}
</section>`;
}

function reviewHtml(studyKit: StudyKit): SafeHtml {
  return html`<section class="section-break" data-section="review">
<h1>Revisão</h1>
${studyKit.reviewSectionList.map(
  (section) => html`<article class="review-topic">
<h2>${kitTextHtml(section.title)}</h2>
${section.paragraphList.map((paragraph) => html`<p>${kitTextHtml(paragraph)}</p>`)}
<div class="key-points"><h3>Para lembrar</h3><ul>${section.keyPointList.map(
    (point) => html`<li>${kitTextHtml(point)}</li>`,
  )}</ul></div>
</article>`,
)}
</section>`;
}

function exampleHtml(example: StudyWorkedExample, index: number): SafeHtml {
  return html`<article class="example" data-kit-item="${example.exampleId}">
<h2>Exemplo ${index + 1}: ${kitTextHtml(example.title)}</h2>
<div class="statement">${kitTextHtml(example.statement)}</div>
${kitTableHtml(example.table)}
<ol class="steps">${example.stepList.map((step) => html`<li>${kitTextHtml(step)}</li>`)}</ol>
<p><span class="label">Resposta:</span> ${expectedAnswerHtml(example.answer.expectedAnswer)}</p>
<p><span class="label">Comentário:</span> ${kitTextHtml(example.commentary)}</p>
</article>`;
}

function examplesHtml(studyKit: StudyKit): SafeHtml {
  return html`<section data-section="examples">
<h1>Exemplos resolvidos</h1>
${studyKit.workedExampleList.map(exampleHtml)}
</section>`;
}

function tipHtml(studyKit: StudyKit, context: KitTemplateContext): SafeHtml {
  return html`<aside class="tip" data-section="tip">
<img alt="" src="${context.assets.mascotDataUrlMap.point}">
<div><h2>Dica do Gizito</h2><p>${kitTextHtml(studyKit.studyTip)}</p></div>
</aside>`;
}

function optionHtml(option: MathOption | PortugueseOption): SafeHtml {
  const content = "text" in option ? kitTextHtml(option.text) : expectedAnswerHtml(option.value);
  return html`<li><span class="option-label">${option.label}</span><span>${content}</span></li>`;
}

function answerSpaceHtml(studyKit: StudyKit, question: StudyQuestion): SafeHtml | null {
  if (studyKit.subject === "math") {
    return question.optionList === null
      ? html`<div class="work-space open">Espaço para o cálculo</div><div class="answer-line"><span class="label">Resposta:</span><span class="line"></span></div>`
      : html`<div class="work-space choice">Espaço para o cálculo</div>`;
  }
  if (question.optionList !== null) return null;
  return html`<div class="writing-lines">${Array.from(
    { length: PORTUGUESE_WRITING_LINE_COUNT },
    () => html`<div class="line"></div>`,
  )}</div>`;
}

function questionHtml(studyKit: StudyKit, question: StudyQuestion): SafeHtml {
  const baseTextTitle = baseTextTitleOf(studyKit, question.baseTextId);
  const optionList: readonly (MathOption | PortugueseOption)[] | null = question.optionList;
  return html`<article class="question" data-kit-item="${question.questionId}">
<div class="question-number">${question.number}</div>
<div class="question-body">
${baseTextTitle === null ? null : html`<p class="base-text-ref">Sobre o texto “${kitTextHtml(baseTextTitle)}”</p>`}
<div class="statement">${kitTextHtml(question.statement)}</div>
${kitTableHtml(question.table)}
${optionList === null ? null : html`<ol class="options${studyKit.subject === "math" ? " compact" : ""}">${optionList.map(optionHtml)}</ol>`}
${answerSpaceHtml(studyKit, question)}
</div>
</article>`;
}

function blockContentHtml(studyKit: StudyKit, block: QuestionBlock): SafeHtml {
  const questionList: readonly StudyQuestion[] =
    block === "practice" ? studyKit.practiceQuestionList : studyKit.mockQuestionList;
  return html`${studyKit.baseTextList
    .filter((baseText) => baseText.block === block)
    .map(baseTextHtml)}${questionList.map((question) => questionHtml(studyKit, question))}`;
}

function practiceHtml(studyKit: StudyKit): SafeHtml {
  return html`<section class="section-break" data-section="practice">
<h1>${blockTitleMap.practice}</h1>
${blockContentHtml(studyKit, "practice")}
</section>`;
}

function mockHtml(studyKit: StudyKit): SafeHtml {
  return html`<section class="section-break" data-section="mock">
<header class="exam-header">
<h1>${blockTitleMap.mock}</h1>
<div class="exam-fields">
<div class="exam-field name"><span class="label">Nome:</span><span class="line"></span></div>
<div class="exam-field"><span class="label">Data:</span><span class="line"></span></div>
</div>
<p class="exam-instructions"><span class="label">Tempo sugerido:</span> ${studyKit.mockSuggestedMinutes} minutos. Leia cada questão com atenção e responda no espaço indicado.</p>
</header>
${blockContentHtml(studyKit, "mock")}
</section>`;
}

export function activitiesDocument(
  studyKit: StudyKit,
  context: KitTemplateContext,
): RenderDocument {
  const body = html`${coverHtml(studyKit, context)}
${reviewHtml(studyKit)}
${examplesHtml(studyKit)}
${tipHtml(studyKit, context)}
${practiceHtml(studyKit)}
${mockHtml(studyKit)}`;
  return {
    html: documentHtml(`Atividades de ${subjectLabelMap[studyKit.subject]}`, context.assets, body),
    headerHtml: headerHtml(studyKit, context.assets),
    footerHtml: footerHtml("Atividades", context.assets),
    itemAttribute: "data-kit-item",
    expectedItemIdList: [...workedExampleIdList, ...questionIdList],
  };
}

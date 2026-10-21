import {
  type AnswerKeyEntry,
  gradeLabelMap,
  listAnswerKey,
  listStudyQuestion,
  type QuestionBlock,
  questionIdList,
  type StudyKit,
  subjectLabelMap,
} from "@gizito/core";
import type { RenderDocument } from "#src/render/document.ts";
import { html, type SafeHtml } from "#src/render/html.ts";
import { expectedAnswerHtml, kitTextHtml } from "#src/render/kit-text.ts";
import {
  aiNoteHtml,
  baseTextTitleOf,
  blockTitleMap,
  documentHtml,
  footerHtml,
  generatedDateHtml,
  headerHtml,
  type KitTemplateContext,
  topicListHtml,
} from "#src/render/templates/kit-v1/common.ts";

const answerBlockList: readonly QuestionBlock[] = ["practice", "mock"];

function coverHtml(studyKit: StudyKit, context: KitTemplateContext): SafeHtml {
  return html`<section class="cover" data-section="cover">
<p class="brand">Gizito</p>
<div class="cover-main">
<div class="cover-text">
<h1>Gabarito de <span class="cover-subject">${subjectLabelMap[studyKit.subject]}</span></h1>
<p class="cover-grade">${gradeLabelMap[studyKit.grade]}</p>
<h2>Assuntos</h2>
${topicListHtml(studyKit)}
</div>
<img class="cover-mascot" alt="" src="${context.assets.mascotDataUrlMap.success}">
</div>
<div class="cover-box">
<p>Respostas comentadas das questões do caderno de atividades, na mesma ordem. Para o responsável conferir depois que a criança resolver.</p>
</div>
${generatedDateHtml(context.generatedAt)}
${aiNoteHtml()}
</section>`;
}

function mainAnswerHtml(entry: AnswerKeyEntry): SafeHtml {
  if (entry.correctOption === null) {
    return html`<p class="answer-main">Resposta: ${expectedAnswerHtml(entry.answer.expectedAnswer)}</p>`;
  }
  const optionContent =
    "text" in entry.correctOption
      ? kitTextHtml(entry.correctOption.text)
      : expectedAnswerHtml(entry.correctOption.value);
  return html`<p class="answer-main">Alternativa ${entry.correctOption.label}: ${optionContent}</p>`;
}

function acceptedHtml(entry: AnswerKeyEntry): SafeHtml | null {
  const answer = entry.answer.expectedAnswer;
  if (answer.kind !== "text" || answer.acceptedList.length === 0) return null;
  return html`<div class="accepted"><p class="label">Também vale:</p><ul>${answer.acceptedList.map(
    (accepted) => html`<li>${kitTextHtml(accepted)}</li>`,
  )}</ul></div>`;
}

function evidenceHtml(studyKit: StudyKit, entry: AnswerKeyEntry): SafeHtml | null {
  if (entry.answer.evidenceQuote === null) return null;
  const question = listStudyQuestion(studyKit).find(
    (candidate) => candidate.questionId === entry.questionId,
  );
  const baseTextTitle = baseTextTitleOf(studyKit, question?.baseTextId ?? null);
  return html`<p class="evidence"><span class="label">Trecho${
    baseTextTitle === null ? null : html` do texto “${kitTextHtml(baseTextTitle)}”`
  }:</span> “${kitTextHtml(entry.answer.evidenceQuote)}”</p>`;
}

function answerHtml(studyKit: StudyKit, entry: AnswerKeyEntry): SafeHtml {
  return html`<article class="answer" data-kit-answer="${entry.questionId}">
<div class="question-number">${entry.number}</div>
<div class="answer-body">
${mainAnswerHtml(entry)}
${acceptedHtml(entry)}
${
  entry.answer.solutionStepList.length === 0
    ? null
    : html`<ol class="steps">${entry.answer.solutionStepList.map(
        (step) => html`<li>${kitTextHtml(step)}</li>`,
      )}</ol>`
}
<p><span class="label">Por quê:</span> ${kitTextHtml(entry.answer.explanation)}</p>
${evidenceHtml(studyKit, entry)}
</div>
</article>`;
}

function answerBlockHtml(studyKit: StudyKit, block: QuestionBlock): SafeHtml {
  return html`<section data-section="answers-${block}">
<h1>${blockTitleMap[block]}</h1>
${listAnswerKey(studyKit)
  .filter((entry) => entry.block === block)
  .map((entry) => answerHtml(studyKit, entry))}
</section>`;
}

export function answerKeyDocument(studyKit: StudyKit, context: KitTemplateContext): RenderDocument {
  const body = html`${coverHtml(studyKit, context)}
<div class="section-break">${answerBlockList.map((block) => answerBlockHtml(studyKit, block))}</div>`;
  return {
    html: documentHtml(`Gabarito de ${subjectLabelMap[studyKit.subject]}`, context.assets, body),
    headerHtml: headerHtml(studyKit, context.assets),
    footerHtml: footerHtml("Gabarito", context.assets),
    itemAttribute: "data-kit-answer",
    expectedItemIdList: questionIdList,
  };
}

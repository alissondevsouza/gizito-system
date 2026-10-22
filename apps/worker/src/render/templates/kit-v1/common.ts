import {
  BRAZIL_TIME_ZONE,
  gradeLabelMap,
  type KitTable,
  type QuestionBlock,
  type StudyBaseText,
  type StudyKit,
  subjectLabelMap,
} from "@gizito/core";
import type { RenderAssets } from "#src/render/assets.ts";
import { BRAND_FONT_FAMILY } from "#src/render/assets.ts";
import { html, type SafeHtml, trustedHtml } from "#src/render/html.ts";
import { kitTextHtml } from "#src/render/kit-text.ts";
import { kitV1Stylesheet } from "#src/render/templates/kit-v1/styles.ts";

export type KitTemplateContext = {
  readonly assets: RenderAssets;
  readonly generatedAt: Date;
  readonly isSample: boolean;
};

export const blockTitleMap: Readonly<Record<QuestionBlock, string>> = {
  practice: "Exercícios de fixação",
  mock: "Mini-simulado",
};

export const SAMPLE_MARK_LABEL = "Kit de amostra";

export const SAMPLE_MARK_TEXT =
  "Gerado pelo próprio Gizito a partir de uma página de caderno de exemplo, para mostrar como é o material.";

export const AI_NOTE_TEXT =
  "Material complementar gerado com apoio de inteligência artificial. Não substitui o professor nem garante nota. Em caso de dúvida, consulte o material da escola ou o professor.";

const kitDateFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: BRAZIL_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatKitDate(date: Date): string {
  return kitDateFormat.format(date);
}

export type DocumentKind = "activities" | "answer-key";

export function documentHtml(
  kind: DocumentKind,
  title: string,
  assets: RenderAssets,
  body: SafeHtml,
): string {
  return html`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>${trustedHtml(assets.stylesheet)}</style>
<style>${trustedHtml(kitV1Stylesheet)}</style>
</head>
<body class="${kind}">${body}</body>
</html>`.value;
}

export function topicListHtml(studyKit: StudyKit): SafeHtml {
  return html`<ul class="cover-topics">${studyKit.topicList.map(
    (topic) => html`<li>${kitTextHtml(topic.label)}</li>`,
  )}</ul>`;
}

export function aiNoteHtml(): SafeHtml {
  return html`<p class="ai-note">${AI_NOTE_TEXT}</p>`;
}

export function generatedDateHtml(generatedAt: Date): SafeHtml {
  return html`<p class="cover-date">Gerado em ${formatKitDate(generatedAt)}</p>`;
}

export function sampleMarkHtml(context: KitTemplateContext): SafeHtml | null {
  if (!context.isSample) return null;
  return html`<p class="sample-mark"><span class="sample-label">${SAMPLE_MARK_LABEL}</span> ${SAMPLE_MARK_TEXT}</p>`;
}

export function fileLabelOf(fileLabel: string, context: KitTemplateContext): string {
  return context.isSample ? `${fileLabel} · ${SAMPLE_MARK_LABEL}` : fileLabel;
}

export function kitTableHtml(table: KitTable | null): SafeHtml | null {
  if (table === null) return null;
  return html`<table class="kit-table"><thead><tr>${table.headerList.map(
    (cell) => html`<th>${kitTextHtml(cell)}</th>`,
  )}</tr></thead><tbody>${table.rowList.map(
    (row) => html`<tr>${row.map((cell) => html`<td>${kitTextHtml(cell)}</td>`)}</tr>`,
  )}</tbody></table>`;
}

export function baseTextTitleOf(studyKit: StudyKit, baseTextId: string | null): string | null {
  if (baseTextId === null) return null;
  return (
    studyKit.baseTextList.find((baseText) => baseText.baseTextId === baseTextId)?.title ?? null
  );
}

export function baseTextHtml(baseText: StudyBaseText): SafeHtml {
  return html`<article class="base-text" data-base-text="${baseText.baseTextId}"><h2>Texto: ${kitTextHtml(
    baseText.title,
  )}</h2>${baseText.paragraphList.map((paragraph) => html`<p>${kitTextHtml(paragraph)}</p>`)}</article>`;
}

const marginalStyle = `font-family:"${BRAND_FONT_FAMILY}",sans-serif;font-size:8pt;color:#54635f;width:100%;padding:0 16mm;display:flex;justify-content:space-between;gap:6mm;white-space:nowrap`;

function marginalFontHtml(assets: RenderAssets): SafeHtml {
  return html`<style>${trustedHtml(assets.marginalFontStylesheet)}</style>`;
}

export function headerHtml(studyKit: StudyKit, assets: RenderAssets): string {
  const topicText = studyKit.topicList.map((topic) => topic.label).join(", ");
  return html`${marginalFontHtml(assets)}<div style="${marginalStyle};align-items:center"><span style="display:flex;align-items:center;gap:2mm"><img alt="Gizito" src="${assets.headerLogoDataUrl}" style="height:7mm;width:auto"><span>${
    subjectLabelMap[studyKit.subject]
  } · ${gradeLabelMap[studyKit.grade]}</span></span><span style="overflow:hidden;text-overflow:ellipsis">${topicText}</span></div>`
    .value;
}

export function footerHtml(fileLabel: string, assets: RenderAssets): string {
  return html`${marginalFontHtml(assets)}<div style="${marginalStyle}"><span>${fileLabel}</span><span>página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`
    .value;
}

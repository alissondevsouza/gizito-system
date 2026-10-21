import { type Subject, subjectLabelMap, subjectList } from "@gizito/core";

const placeholderPattern = /\{\{([A-Z0-9_]+)\}\}/g;

export class PromptTemplateError extends Error {
  constructor(readonly placeholder: string) {
    super(`placeholder sem valor no prompt: ${placeholder}`);
    this.name = "PromptTemplateError";
  }
}

export function fillPromptTemplate(
  template: string,
  valueMap: Readonly<Record<string, string>>,
): string {
  return template.replace(placeholderPattern, (_match, placeholder: string) => {
    const value = valueMap[placeholder];
    if (value === undefined) throw new PromptTemplateError(placeholder);
    return value;
  });
}

const SECTION_TITLE_PREFIX = "# ";

function subjectSectionTitleOf(subject: Subject): string {
  return `${SECTION_TITLE_PREFIX}[${subjectLabelMap[subject]}]`;
}

export function selectSubjectSection(template: string, subject: Subject): string {
  const otherTitleList = subjectList
    .filter((other) => other !== subject)
    .map(subjectSectionTitleOf);
  const ownTitle = subjectSectionTitleOf(subject);
  const keptLineList: string[] = [];
  let isSkipping = false;
  for (const line of template.split("\n")) {
    if (line.startsWith(SECTION_TITLE_PREFIX)) isSkipping = otherTitleList.includes(line);
    if (isSkipping) continue;
    keptLineList.push(
      line === ownTitle ? `${SECTION_TITLE_PREFIX}${subjectLabelMap[subject]}` : line,
    );
  }
  return keptLineList.join("\n");
}

const angleBracketPattern = /[<>]/g;

export function toPromptText(text: string): string {
  return text.replace(angleBracketPattern, "");
}

export function toPromptData(text: string | null, maxLength: number): string {
  return text === null ? "" : toPromptText(text).trim().slice(0, maxLength);
}

export function toPromptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

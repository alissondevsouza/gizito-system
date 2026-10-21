const htmlEscapeMap: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export class SafeHtml {
  constructor(readonly value: string) {}
}

export type HtmlValue = SafeHtml | string | number | null | readonly HtmlValue[];

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => htmlEscapeMap[character] ?? character);
}

function isHtmlValueList(value: HtmlValue): value is readonly HtmlValue[] {
  return Array.isArray(value);
}

function htmlOf(value: HtmlValue): string {
  if (value === null) return "";
  if (value instanceof SafeHtml) return value.value;
  if (isHtmlValueList(value)) return value.map(htmlOf).join("");
  return escapeHtml(String(value));
}

export function html(
  stringList: TemplateStringsArray,
  ...valueList: readonly HtmlValue[]
): SafeHtml {
  return new SafeHtml(
    valueList.reduce<string>(
      (result, value, index) => `${result}${htmlOf(value)}${stringList[index + 1] ?? ""}`,
      stringList[0] ?? "",
    ),
  );
}

export function trustedHtml(markup: string): SafeHtml {
  return new SafeHtml(markup);
}

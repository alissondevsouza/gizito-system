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

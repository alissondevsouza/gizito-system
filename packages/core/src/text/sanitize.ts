const controlOrFormatCharacterPattern = /[\p{Cc}\p{Cf}]/gu;
const whitespaceRunPattern = /\s+/g;

export function sanitizeUntrustedText(text: string): string {
  return text
    .normalize("NFC")
    .replace(controlOrFormatCharacterPattern, " ")
    .replace(whitespaceRunPattern, " ")
    .trim();
}

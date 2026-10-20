const MATH_MARKUP_OPEN = "\\(";

type FoldedText = {
  readonly folded: string;
  readonly startList: readonly number[];
  readonly endList: readonly number[];
};

function foldWithPosition(text: string): FoldedText {
  let folded = "";
  const startList: number[] = [];
  const endList: number[] = [];
  let index = 0;
  for (const character of text) {
    const base = character.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    if (base !== "") {
      folded += /^[a-z0-9]$/.test(base) ? base : " ";
      startList.push(index);
      endList.push(index + character.length);
    } else if (endList.length > 0) {
      endList[endList.length - 1] = index + character.length;
    }
    index += character.length;
  }
  return { folded, startList, endList };
}

export function foldKeywordText(text: string): string {
  return foldWithPosition(text).folded;
}

export function normalizeSpacing(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function hasBalancedMathMarkup(text: string): boolean {
  let isOpen = false;
  for (const match of text.matchAll(/\\\(|\\\)/g)) {
    const isOpenToken = match[0] === MATH_MARKUP_OPEN;
    if (isOpenToken === isOpen) return false;
    isOpen = isOpenToken;
  }
  return !isOpen;
}

export function blankMathMarkup(text: string): string {
  return text.replace(/\\\([\s\S]*?\\\)/g, (segment) => " ".repeat(segment.length));
}

export function listMathMarkupSegment(text: string): readonly string[] {
  return [...text.matchAll(/\\\(([\s\S]*?)\\\)/g)].map((match) => match[1] ?? "");
}

function firstMatchOf(text: string, patternList: readonly RegExp[]): string | null {
  for (const pattern of patternList) {
    const match = pattern.exec(text);
    if (match) return match[0];
  }
  return null;
}

const personalDataPatternList: readonly RegExp[] = [
  /(?<!\d)(?:\(\s?[1-9]{2}\s?\)|[1-9]{2})[\s.-]?(?:9\s?\d{4}|[2-5]\d{3})[\s.-]?\d{4}(?!\d)/,
  /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/u,
  /(?<!\d)\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)/,
  /(?<!\d)\d{11}(?!\d)/,
];

export function findPersonalDataExcerpt(text: string): string | null {
  return firstMatchOf(text, personalDataPatternList);
}

const externalLinkPatternList: readonly RegExp[] = [
  /\bhttps?:\/\/\S+/i,
  /(?<![\p{L}\p{N}])www\.\S+/iu,
  /(?<![\p{L}\p{N}@.-])[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.(?:com|net|org|gov|edu)(?:\.br)?(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}._%+-])@[\p{L}\p{N}_.]{2,}/u,
];

export function findExternalLinkExcerpt(text: string): string | null {
  return firstMatchOf(text, externalLinkPatternList);
}

const forbiddenMarkupPatternList: readonly RegExp[] = [
  /(?<=\p{L})\*\*|\*\*(?=\p{L})/u,
  /(?<![\p{L}\p{N}_])__(?=\p{L})|(?<=\p{L})__(?![\p{L}\p{N}_])/u,
  /^#+ /m,
  /\[[^\]\n]+\]\([^)\s]+\)/,
  /`/,
  /<\/?[a-z][a-z0-9]*(?:\s[^<>]*)?\/?>/,
  /\p{Extended_Pictographic}/u,
];

export function findForbiddenMarkupExcerpt(text: string): string | null {
  return firstMatchOf(blankMathMarkup(text), forbiddenMarkupPatternList);
}

function phrasePattern(phraseList: readonly string[]): string {
  return `(?:${phraseList.map((phrase) => phrase.split(" ").join(" +")).join("|")})`;
}

function wholeExpressionPattern(source: string): RegExp {
  return new RegExp(`(?<![a-z0-9])${source}(?![a-z0-9])`);
}

function originalSlice(text: string, folded: FoldedText, start: number, end: number): string {
  return text.slice(folded.startList[start], folded.endList[end - 1]);
}

function findFoldedExcerpt(text: string, pattern: RegExp): string | null {
  const folded = foldWithPosition(text);
  const match = pattern.exec(folded.folded);
  return match ? originalSlice(text, folded, match.index, match.index + match[0].length) : null;
}

const figureVerbPattern = wholeExpressionPattern(
  `${phrasePattern(["observe", "veja", "olhe"])} +${phrasePattern([
    "a figura",
    "a imagem",
    "o desenho",
    "o grafico",
    "a ilustracao",
  ])}`,
);

const figurePositionPattern = new RegExp(
  wholeExpressionPattern(
    `${phrasePattern([
      "a figura",
      "na figura",
      "da figura",
      "o desenho",
      "no desenho",
      "a imagem",
      "na imagem",
      "o grafico",
      "no grafico",
      "a ilustracao",
      "na ilustracao",
    ])} +${phrasePattern(["abaixo", "acima", "ao lado"])}`,
  ).source,
  "g",
);

const narrativePositionComplementPattern = /^\s+(?:de|da|do|das|dos)(?![\p{L}\p{N}])/iu;

const childMaterialPattern = wholeExpressionPattern(
  `${phrasePattern(["veja", "abra", "consulte", "copie"])} +${phrasePattern([
    "o livro",
    "a apostila",
    "o caderno",
    "seu livro",
    "sua apostila",
    "seu caderno",
  ])}`,
);

export function findFigureReferenceExcerpt(text: string): string | null {
  const verbExcerpt = findFoldedExcerpt(text, figureVerbPattern);
  if (verbExcerpt !== null) return verbExcerpt;
  const folded = foldWithPosition(text);
  for (const match of folded.folded.matchAll(figurePositionPattern)) {
    const end = match.index + match[0].length;
    const originalEnd = folded.endList[end - 1];
    if (!narrativePositionComplementPattern.test(text.slice(originalEnd))) {
      return originalSlice(text, folded, match.index, end);
    }
  }
  return findFoldedExcerpt(text, childMaterialPattern);
}

export const blockedTermList = [
  "arrombada",
  "arrombado",
  "babaca",
  "boceta",
  "boquete",
  "bosta",
  "buceta",
  "caralho",
  "crioulo",
  "cu",
  "cuzao",
  "fdp",
  "foda",
  "foder",
  "fodido",
  "idiota",
  "imbecil",
  "merda",
  "otaria",
  "otario",
  "piroca",
  "porra",
  "pqp",
  "punheta",
  "puta",
  "putaria",
  "puto",
  "retardada",
  "retardado",
  "sapatao",
  "traveco",
  "vadia",
  "vagabunda",
  "viado",
  "xereca",
  "xoxota",
] as const;

const blockedTermPattern = wholeExpressionPattern(phrasePattern(blockedTermList));

export function findBlockedTermExcerpt(text: string): string | null {
  return findFoldedExcerpt(text, blockedTermPattern);
}

export const mockHintPhraseList = [
  "dica",
  "lembre se",
  "como vimos",
  "volte a revisao",
  "como no exemplo",
] as const;

const mockHintPattern = wholeExpressionPattern(phrasePattern(mockHintPhraseList));

export function findMockHintExcerpt(text: string): string | null {
  return findFoldedExcerpt(text, mockHintPattern);
}

import type { Grade, Legibility, PreviewFailCode, Subject, UnsupportedTopicId } from "@gizito/core";

export type ExtractionCase = {
  readonly caseId: string;
  readonly fileName: string;
  readonly sha256: string;
  readonly grade: Grade;
  readonly subject: Subject;
  readonly blurSigma: number | null;
  readonly expectedLegibility: Legibility;
  readonly expectedFailCode: PreviewFailCode | null;
  readonly requiredTopicIdList: readonly string[];
  readonly acceptableTopicIdList: readonly string[];
  readonly unsupportedTopicIdList: readonly UnsupportedTopicId[];
  readonly copiedPhraseList: readonly string[];
};

const UNREADABLE_BLUR_SIGMA = 14;

const punctuationCase: ExtractionCase = {
  caseId: "4-portuguese-pontuacao",
  fileName: "4-portugues-pontuacao.png",
  sha256: "bd40943353887cd07dc9a50462c6c924469525829d27690ba730d1fd5379edd9",
  grade: "4",
  subject: "portuguese",
  blurSigma: null,
  expectedLegibility: "good",
  expectedFailCode: null,
  requiredTopicIdList: ["lp4-punctuation"],
  acceptableTopicIdList: [],
  unsupportedTopicIdList: [],
  copiedPhraseList: ["O cachorro está no quintal", "Maria comprou pão"],
};

export const extractionCaseList: readonly ExtractionCase[] = [
  {
    caseId: "4-math-adicao-subtracao-cortada",
    fileName: "4-matematica-adicao-e-subtracao.png",
    sha256: "26f49a819aec56e39549d5754818ef9915076a14416aa0117676843126751c5a",
    grade: "4",
    subject: "math",
    blurSigma: null,
    expectedLegibility: "partial",
    expectedFailCode: null,
    requiredTopicIdList: ["ma4-addition-subtraction"],
    acceptableTopicIdList: ["ma4-place-value", "ma4-natural-numbers"],
    unsupportedTopicIdList: [],
    copiedPhraseList: ["456 + 289", "738 - 465"],
  },
  punctuationCase,
  {
    caseId: "4-portuguese-producao-textual",
    fileName: "4-portugues-producao-textual.png",
    sha256: "18278a5ae657510565e80a9e21bb6962a4eb41ee90bf782c590ad5de95bacce8",
    grade: "4",
    subject: "portuguese",
    blurSigma: null,
    expectedLegibility: "partial",
    expectedFailCode: "only_unsupported_topics",
    requiredTopicIdList: [],
    acceptableTopicIdList: [],
    unsupportedTopicIdList: ["lp-essay-writing"],
    copiedPhraseList: ["No último sábado", "Meu passeio ao zoológico"],
  },
  {
    caseId: "5-math-divisao-cortada",
    fileName: "5-matematica-divisao.png",
    sha256: "0672624dbdcc2fcee8a658a97f56180bce6d46fbfe534d8ff98c893f1d77b852",
    grade: "5",
    subject: "math",
    blurSigma: null,
    expectedLegibility: "partial",
    expectedFailCode: null,
    requiredTopicIdList: ["ma5-multiplication-division"],
    acceptableTopicIdList: [],
    unsupportedTopicIdList: [],
    copiedPhraseList: ["243 ÷ 3", "125 ÷ 5"],
  },
  {
    caseId: "5-math-fracoes-decimais-perimetro",
    fileName: "5-matematica-fracoes-decimais-e-perimetro.png",
    sha256: "fb41aa623b2d67d402158fc658f8bc7f727a7d690a5d330b0ed9562b7afc9d88",
    grade: "5",
    subject: "math",
    blurSigma: null,
    expectedLegibility: "good",
    expectedFailCode: null,
    requiredTopicIdList: ["ma5-equivalent-fractions", "ma5-decimal-numbers", "ma5-perimeter-area"],
    acceptableTopicIdList: [
      "ma5-fractions",
      "ma5-comparing-rationals",
      "ma5-addition-subtraction",
      "ma5-multiplication-division",
    ],
    unsupportedTopicIdList: [],
    copiedPhraseList: ["um inteiro e vinte e cinco centésimos", "Calcule o perímetro das figuras"],
  },
  {
    caseId: "5-portuguese-interpretacao-e-redacao",
    fileName: "5-portugues-interpretacao-e-producao-textual.png",
    sha256: "de3a436aa1f91c2758e510dc237bf47b3302f38ec4a81e725a06fc96c202734e",
    grade: "5",
    subject: "portuguese",
    blurSigma: null,
    expectedLegibility: "good",
    expectedFailCode: null,
    requiredTopicIdList: ["lp5-explicit-information"],
    acceptableTopicIdList: [
      "lp5-main-idea",
      "lp5-inference-humor",
      "lp5-narrative",
      "lp5-word-meaning",
    ],
    unsupportedTopicIdList: ["lp-essay-writing"],
    copiedPhraseList: ["Lucas era um menino que adorava brincar", "Um lugar especial para mim"],
  },
  {
    caseId: "6-math-angulos",
    fileName: "6-matematica-angulos.png",
    sha256: "512a70968d01baa0e2d7a9faad86f10653a81aaa4c394c2ea1ea1e56d6034bb4",
    grade: "6",
    subject: "math",
    blurSigma: null,
    expectedLegibility: "good",
    expectedFailCode: null,
    requiredTopicIdList: ["ma6-angles"],
    acceptableTopicIdList: [],
    unsupportedTopicIdList: [],
    copiedPhraseList: ["abertura formada por duas semirretas", "Desenhe um ângulo de 80"],
  },
  {
    caseId: "6-portuguese-substantivos",
    fileName: "6-portugues-substantivos-primitivos-derivados-coletivos.png",
    sha256: "df25efbda7524830bda2e2e417e104b01cef4f344a83b27b9e8c269cd1dcdbe4",
    grade: "6",
    subject: "portuguese",
    blurSigma: null,
    expectedLegibility: "good",
    expectedFailCode: null,
    requiredTopicIdList: ["lp6-nouns"],
    acceptableTopicIdList: ["lp6-word-formation"],
    unsupportedTopicIdList: [],
    copiedPhraseList: ["dá origem a outras palavras", "mesmo no singular, indica um conjunto"],
  },
  {
    caseId: "7-math-inteiros-e-fracoes",
    fileName: "7-matematica-numeros-inteiros-e-fracoes.png",
    sha256: "b2f27f13f02615103ba69222c8613b5cf165d41707b204bd932b0887753963a6",
    grade: "7",
    subject: "math",
    blurSigma: null,
    expectedLegibility: "good",
    expectedFailCode: null,
    requiredTopicIdList: ["ma7-integer-addition-subtraction", "ma7-rational-operations"],
    acceptableTopicIdList: [
      "ma7-integers",
      "ma7-integer-multiplication-division",
      "ma7-rational-numbers",
      "ma7-fractions-ratio",
    ],
    unsupportedTopicIdList: [],
    copiedPhraseList: ["Lembre-se da ordem", "(-5) + 3 = -2"],
  },
  {
    caseId: "7-portuguese-figuras-de-linguagem",
    fileName: "7-portugues-figuras-de-linguagem.png",
    sha256: "ce2ae3a1caf5d1ac3cc2c2f8c4886f982410a9da121b19a0442f8b1b0af9d5a3",
    grade: "7",
    subject: "portuguese",
    blurSigma: null,
    expectedLegibility: "good",
    expectedFailCode: null,
    requiredTopicIdList: ["lp7-figures-of-speech"],
    acceptableTopicIdList: [],
    unsupportedTopicIdList: [],
    copiedPhraseList: ["Meu coração é um tambor", "A cidade não dorme nunca"],
  },
  {
    ...punctuationCase,
    caseId: "4-portuguese-pontuacao-desfocada",
    blurSigma: UNREADABLE_BLUR_SIGMA,
    expectedLegibility: "unreadable",
    expectedFailCode: "photos_unreadable",
    requiredTopicIdList: [],
    copiedPhraseList: [],
  },
];

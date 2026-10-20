import {
  buildKitPlan,
  buildSlotPlan,
  MATH_TOPIC_REF_LIST,
  PORTUGUESE_TOPIC_REF_LIST,
} from "#src/__tests__/__fixtures__/kit.ts";
import { createTableMathEvaluator } from "#src/__tests__/__fixtures__/math-evaluator.ts";
import { OTHER_TOPIC_REF } from "#src/constants.ts";
import type { Subject } from "#src/enums.ts";
import type { MathEvaluator } from "#src/interfaces/math-evaluator.ts";
import type { ExpectedAnswer } from "#src/pedagogy/expected-answer.ts";
import type { MaterialProfile } from "#src/pedagogy/extraction/schemas.ts";
import { composeStudyKit } from "#src/pedagogy/kit/compose.ts";
import {
  type MathKitContent,
  type MathStudyKit,
  mathKitContentSchema,
  type PortugueseKitContent,
  type PortugueseStudyKit,
  portugueseKitContentSchema,
  type StudyKit,
} from "#src/pedagogy/kit/schemas.ts";
import { optionLabelList } from "#src/pedagogy/kit-item.ts";
import type { KitPlan } from "#src/pedagogy/plan/schemas.ts";
import type { KitSlotPlan } from "#src/pedagogy/slots.ts";

export const GENERATION_VERSION = "extract-v1+plan-v1+generate-v1+review-v1";

export const FIXTURE_MATERIAL_PROFILE: MaterialProfile = {
  exerciseFormatList: ["word_problem"],
  notationList: [],
  terminologyList: [],
  contextThemeList: ["compras no mercado"],
  apparentLevel: "at_grade",
  hasFigures: false,
  isHandwritten: false,
};

const nameList = [
  "Ana",
  "Bruno",
  "Carla",
  "Davi",
  "Elisa",
  "Felipe",
  "Gabi",
  "Heitor",
  "Iris",
  "Joana",
  "Kauã",
  "Lara",
  "Mateus",
  "Nina",
  "Otávio",
  "Paula",
  "Rafael",
  "Sofia",
  "Tiago",
  "Vera",
];
const objectList = [
  "lápis",
  "livros",
  "bolas",
  "figurinhas",
  "balas",
  "flores",
  "carrinhos",
  "bonecas",
  "pipas",
  "botões",
  "chaveiros",
  "copos",
  "pratos",
  "pães",
  "ovos",
  "maçãs",
  "laranjas",
  "peras",
  "bananas",
  "uvas",
];

type MathSeed = { readonly a: number; readonly b: number };

const mathSeedList: readonly MathSeed[] = Array.from({ length: 20 }, (_, index) => ({
  a: 3 + index,
  b: 4 + ((index * 7) % 17),
}));

function mathStatementOf(topicRef: string, index: number, { a, b }: MathSeed): string {
  const name = nameList[index] ?? "Ana";
  const object = objectList[index] ?? "lápis";
  if (topicRef === "ma5-perimeter-area") {
    return `O canteiro retangular de ${name} mede ${a} m por ${b} m. Qual é a área do canteiro?`;
  }
  if (topicRef === OTHER_TOPIC_REF) {
    return `${name} comprou ${a} pacotes de ${object} e cada pacote custou ${b} reais. Quanto ${name} gastou?`;
  }
  return `${name} tem ${a} caixas com ${b} ${object} em cada uma. Quantos ${object} ${name} tem ao todo?`;
}

function unitOfTopic(topicRef: string): string | null {
  if (topicRef === "ma5-perimeter-area") return "m²";
  return topicRef === OTHER_TOPIC_REF ? "R$" : null;
}

function numberAnswer(value: number, unit: string | null): ExpectedAnswer {
  return { kind: "number", value, unit, tolerance: 0 };
}

function rotatedOptionValueList(valueList: readonly number[], correctIndex: number): number[] {
  const [correct, ...distractorList] = valueList;
  if (correct === undefined) return [];
  const result = [...distractorList];
  result.splice(correctIndex, 0, correct);
  return result;
}

export type MathFixture = {
  readonly kitSlotPlan: KitSlotPlan;
  readonly plan: KitPlan;
  readonly content: MathKitContent;
  readonly studyKit: MathStudyKit;
  readonly mathEvaluator: MathEvaluator;
};

export type PortugueseFixture = {
  readonly kitSlotPlan: KitSlotPlan;
  readonly plan: KitPlan;
  readonly content: PortugueseKitContent;
  readonly studyKit: PortugueseStudyKit;
  readonly mathEvaluator: MathEvaluator;
};

function composeFixture(
  subject: Subject,
  kitSlotPlan: KitSlotPlan,
  plan: KitPlan,
  content: MathKitContent | PortugueseKitContent,
): StudyKit {
  const result = composeStudyKit({
    content,
    kitSlotPlan,
    plan,
    grade: "5",
    subject,
    perceivedDifficulty: null,
    materialProfile: FIXTURE_MATERIAL_PROFILE,
    sourceWarningCodeList: [],
    generationVersion: GENERATION_VERSION,
  });
  if (!result.ok) throw new Error(`fixture does not compose: ${JSON.stringify(result.error)}`);
  return result.value;
}

export function buildMathFixture(): MathFixture {
  const kitSlotPlan = buildSlotPlan(MATH_TOPIC_REF_LIST);
  const plan = buildKitPlan(kitSlotPlan, "math");
  const resultByExpression = new Map<string, ExpectedAnswer>();
  const slotList = [...kitSlotPlan.practiceSlotList, ...kitSlotPlan.mockSlotList];
  const questionList = slotList.map((slot, index) => {
    const seed = mathSeedList[index] ?? { a: 3, b: 4 };
    const detail = plan.slotDetailList[index];
    const unit = unitOfTopic(slot.topicRef);
    const expectedAnswer = numberAnswer(seed.a * seed.b, unit);
    const calculationExpression = `${seed.a} * ${seed.b}`;
    resultByExpression.set(calculationExpression, expectedAnswer);
    const isMultipleChoice = detail?.questionType === "multiple_choice";
    const correctIndex = index % optionLabelList.length;
    const optionValueList = rotatedOptionValueList(
      [seed.a * seed.b, seed.a + seed.b, seed.a * seed.b + seed.a, seed.a * seed.b - 1],
      correctIndex,
    );
    return {
      questionId: slot.slotId,
      statement: mathStatementOf(slot.topicRef, index, seed),
      table: null,
      optionList: isMultipleChoice
        ? optionLabelList.map((label, optionIndex) => ({
            label,
            value: numberAnswer(optionValueList[optionIndex] ?? 0, unit),
          }))
        : null,
      answer: {
        correctOptionLabel: isMultipleChoice ? (optionLabelList[correctIndex] ?? null) : null,
        expectedAnswer,
        computable: true,
        calculationExpression,
        solutionStepList: [`Multiplicar ${seed.a} por ${seed.b}.`],
        explanation: `São ${seed.a} grupos de ${seed.b}, então a conta é ${seed.a} vezes ${seed.b}.`,
        evidenceQuote: null,
      },
    };
  });
  resultByExpression.set("7 * 6", numberAnswer(42, null));
  resultByExpression.set("8 * 5", numberAnswer(40, "m²"));
  const content = mathKitContentSchema.parse({
    reviewSectionList: kitSlotPlan.reviewSectionTopicRefList.map((topicRef, index) => ({
      topicRef,
      title: `Revisão do assunto ${index + 1}`,
      paragraphList: ["Neste assunto, a turma resolve contas com números naturais do dia a dia."],
      keyPointList: ["Leia o problema com calma.", "Confira a resposta no final."],
    })),
    workedExampleList: [
      {
        exampleId: "e1",
        title: "Laranjas na feira",
        statement: "Na feira, cada cesta tem 7 laranjas. Quantas laranjas há em 6 cestas iguais?",
        table: null,
        stepList: ["Ver quantas laranjas há em cada cesta: 7.", "Multiplicar 7 por 6."],
        answer: {
          correctOptionLabel: null,
          expectedAnswer: numberAnswer(42, null),
          computable: true,
          calculationExpression: "7 * 6",
          solutionStepList: ["Multiplicar 7 por 6 dá 42."],
          explanation: "São 6 cestas com 7 laranjas, então são 42 laranjas.",
          evidenceQuote: null,
        },
        commentary: "Quando os grupos são iguais, a multiplicação é o caminho mais curto.",
      },
      {
        exampleId: "e2",
        title: "Área da sala",
        statement: "Uma sala retangular mede 8 m por 5 m. Qual é a área da sala?",
        table: null,
        stepList: ["Anotar as medidas: 8 m e 5 m.", "Multiplicar o comprimento pela largura."],
        answer: {
          correctOptionLabel: null,
          expectedAnswer: numberAnswer(40, "m²"),
          computable: true,
          calculationExpression: "8 * 5",
          solutionStepList: ["Multiplicar 8 por 5 dá 40 metros quadrados."],
          explanation: "A área do retângulo é o comprimento vezes a largura: 40 m².",
          evidenceQuote: null,
        },
        commentary: "A unidade de área é o metro quadrado, escrito m².",
      },
    ],
    baseTextList: [],
    practiceQuestionList: questionList.slice(0, 10),
    mockQuestionList: questionList.slice(10),
    mockSuggestedMinutes: 40,
    studyTip: "Faça uma questão por vez e confira cada conta.",
  });
  const studyKit = composeFixture("math", kitSlotPlan, plan, content);
  if (studyKit.subject !== "math") throw new Error("fixture subject");
  return {
    kitSlotPlan,
    plan,
    content,
    studyKit,
    mathEvaluator: createTableMathEvaluator(resultByExpression),
  };
}

const masculineOrdinalList = [
  "primeiro",
  "segundo",
  "terceiro",
  "quarto",
  "quinto",
  "sexto",
  "sétimo",
  "oitavo",
  "nono",
  "décimo",
  "último",
  "penúltimo",
];
const feminineOrdinalList = masculineOrdinalList.map((ordinal) =>
  ordinal.replace(/o$/, "a").replace(/^último$/, "última"),
);

const tripSentenceList = [
  "o museu da cidade",
  "a praça central",
  "o parque das águas",
  "a biblioteca antiga",
  "o mercado de peixes",
  "a estação de trem",
  "o jardim botânico",
  "a fábrica de doces",
  "o teatro municipal",
  "a feira de livros",
  "o porto dos barcos",
  "a casa da cultura",
].map(
  (place, index) =>
    `No ${masculineOrdinalList[index]} dia, os alunos conheceram ${place} e conversaram sobre o que viram.`,
);

const gardenSentenceList = [
  "alface",
  "cenoura",
  "tomate",
  "couve",
  "abóbora",
  "feijão",
  "milho",
  "rabanete",
  "beterraba",
  "salsa",
  "cebolinha",
  "pepino",
].map(
  (plant, index) =>
    `Na ${feminineOrdinalList[index]} semana, as crianças plantaram ${plant} e regaram os canteiros com cuidado.`,
);

const turtleSentenceList = [
  "a beira do rio",
  "a sombra da mangueira",
  "o alto do morro",
  "a toca do tatu",
  "o campo de flores",
  "a ponte de madeira",
  "o lago azul",
  "a cerca do sítio",
  "o pé de goiaba",
  "a trilha da mata",
  "a pedra grande",
  "o ninho do sabiá",
].map(
  (place, index) =>
    `Na ${feminineOrdinalList[index]} manhã, o jabuti caminhou até ${place} e esperou sem pressa.`,
);

function paragraphsOf(sentenceList: readonly string[]): string[] {
  return [sentenceList.slice(0, 6).join(" "), sentenceList.slice(6).join(" ")];
}

type PortugueseSeed = {
  readonly statement: string;
  readonly answer: string;
  readonly distractorList: readonly string[];
  readonly evidenceQuote: string | null;
};

const portugueseSeedList: readonly PortugueseSeed[] = [
  {
    statement: "De acordo com a fábula, para onde o jabuti foi na primeira manhã?",
    answer: "Até a beira do rio.",
    distractorList: ["Até o lago azul.", "Até a toca do tatu.", "Até a pedra grande."],
    evidenceQuote: turtleSentenceList[0] ?? null,
  },
  {
    statement: "Releia a fábula e diga o que o jabuti fez depois de chegar à sombra da mangueira.",
    answer: "Esperou sem pressa.",
    distractorList: [],
    evidenceQuote: "o jabuti caminhou até a sombra da mangueira e esperou sem pressa",
  },
  {
    statement: "Qual lugar o jabuti visitou na terceira manhã, segundo o texto?",
    answer: "O alto do morro.",
    distractorList: ["A ponte de madeira.", "O campo de flores.", "O ninho do sabiá."],
    evidenceQuote: turtleSentenceList[2] ?? null,
  },
  {
    statement:
      "Escreva um sinônimo para a palavra contente na frase: Ana ficou contente com o presente.",
    answer: "Feliz.",
    distractorList: [],
    evidenceQuote: null,
  },
  {
    statement: "Qual palavra completa a frase com sentido: O menino ______ a porta com cuidado?",
    answer: "abriu",
    distractorList: ["voou", "nadou", "choveu"],
    evidenceQuote: null,
  },
  {
    statement:
      "Explique o sentido da expressão dar uma mãozinha na frase: Pedro deu uma mãozinha ao vizinho.",
    answer: "Ajudar alguém.",
    distractorList: [],
    evidenceQuote: null,
  },
  {
    statement: "Em qual frase a palavra banco indica um lugar para sentar?",
    answer: "Sentei no banco da praça.",
    distractorList: [
      "Fui ao banco pagar a conta.",
      "O banco abriu cedo hoje.",
      "Ele guardou dinheiro no banco.",
    ],
    evidenceQuote: null,
  },
  {
    statement:
      "Qual é a ideia principal da frase: Beber água todos os dias ajuda o corpo a funcionar bem?",
    answer: "Beber água faz bem ao corpo.",
    distractorList: [],
    evidenceQuote: null,
  },
  {
    statement: "Qual título combina melhor com um texto sobre cuidados com os dentes?",
    answer: "Sorriso saudável",
    distractorList: ["Viagem ao espaço", "Receita de bolo", "Jogo de futebol"],
    evidenceQuote: null,
  },
  {
    statement: "Escreva o antônimo de alegre usado na frase: O palhaço estava alegre.",
    answer: "Triste.",
    distractorList: [],
    evidenceQuote: null,
  },
  {
    statement: "Segundo o conto, que lugar os alunos conheceram no primeiro dia?",
    answer: "O museu da cidade.",
    distractorList: ["O teatro municipal.", "A feira de livros.", "O porto dos barcos."],
    evidenceQuote: tripSentenceList[0] ?? null,
  },
  {
    statement: "Conte com suas palavras o que a turma fez depois de visitar a praça central.",
    answer: "Conversou sobre o que viu.",
    distractorList: [],
    evidenceQuote: "os alunos conheceram a praça central e conversaram sobre o que viram",
  },
  {
    statement: "Qual foi o passeio do terceiro dia da viagem?",
    answer: "O parque das águas.",
    distractorList: ["A estação de trem.", "O jardim botânico.", "A casa da cultura."],
    evidenceQuote: tripSentenceList[2] ?? null,
  },
  {
    statement: "Por que podemos dizer que os alunos aprenderam muito na viagem?",
    answer: "Porque conversavam sobre tudo o que viam.",
    distractorList: [],
    evidenceQuote: "conversaram sobre o que viram",
  },
  {
    statement: "Em que dia da viagem a turma visitou o mercado de peixes?",
    answer: "No quinto dia.",
    distractorList: ["No primeiro dia.", "No oitavo dia.", "No último dia."],
    evidenceQuote: tripSentenceList[4] ?? null,
  },
  {
    statement: "O que as crianças plantaram na primeira semana da horta?",
    answer: "Alface.",
    distractorList: [],
    evidenceQuote: gardenSentenceList[0] ?? null,
  },
  {
    statement: "Qual cuidado as crianças tiveram com os canteiros, de acordo com a notícia?",
    answer: "Regaram com cuidado.",
    distractorList: ["Pintaram de azul.", "Cobriram com lona.", "Mudaram de lugar."],
    evidenceQuote: "regaram os canteiros com cuidado",
  },
  {
    statement: "Cite o legume plantado na terceira semana, conforme o texto.",
    answer: "Tomate.",
    distractorList: [],
    evidenceQuote: gardenSentenceList[2] ?? null,
  },
  {
    statement: "Qual é o assunto principal da notícia sobre a horta?",
    answer: "O plantio da horta pelas crianças.",
    distractorList: ["Uma viagem de trem.", "Um jogo de futebol.", "A reforma da escola."],
    evidenceQuote: gardenSentenceList[1] ?? null,
  },
  {
    statement: "Explique em uma frase como as crianças cuidaram da horta durante as semanas.",
    answer: "Plantaram e regaram os canteiros.",
    distractorList: [],
    evidenceQuote: "as crianças plantaram couve e regaram os canteiros com cuidado",
  },
];

export function buildPortugueseFixture(): PortugueseFixture {
  const kitSlotPlan = buildSlotPlan(PORTUGUESE_TOPIC_REF_LIST);
  const plan = buildKitPlan(kitSlotPlan, "portuguese");
  const slotList = [...kitSlotPlan.practiceSlotList, ...kitSlotPlan.mockSlotList];
  const questionList = slotList.map((slot, index) => {
    const seed = portugueseSeedList[index];
    const detail = plan.slotDetailList[index];
    if (seed === undefined || detail === undefined) throw new Error("fixture seed");
    const isMultipleChoice = detail.questionType === "multiple_choice";
    const correctIndex = index % optionLabelList.length;
    const optionTextList = [...seed.distractorList];
    optionTextList.splice(correctIndex, 0, seed.answer);
    return {
      questionId: slot.slotId,
      statement: seed.statement,
      table: null,
      optionList: isMultipleChoice
        ? optionLabelList.map((label, optionIndex) => ({
            label,
            text: optionTextList[optionIndex] ?? "",
          }))
        : null,
      answer: {
        correctOptionLabel: isMultipleChoice ? (optionLabelList[correctIndex] ?? null) : null,
        expectedAnswer: { kind: "text", value: seed.answer, acceptedList: [] },
        computable: false,
        calculationExpression: null,
        solutionStepList: [],
        explanation: "A resposta está no trecho indicado e responde ao que a pergunta pede.",
        evidenceQuote: detail.baseTextId === null ? null : seed.evidenceQuote,
      },
    };
  });
  const content = portugueseKitContentSchema.parse({
    reviewSectionList: kitSlotPlan.reviewSectionTopicRefList.map((topicRef, index) => ({
      topicRef,
      title: `Revisão do assunto ${index + 1}`,
      paragraphList: [
        "Para entender um texto, leia com atenção e procure o que ele mais quer dizer.",
      ],
      keyPointList: ["Leia o texto inteiro.", "Volte ao trecho que responde à pergunta."],
    })),
    workedExampleList: [
      {
        exampleId: "e1",
        title: "A ideia principal",
        statement:
          "Leia a frase: As abelhas trabalham juntas para produzir mel. Qual é a ideia principal?",
        table: null,
        stepList: ["Ler a frase com atenção.", "Procurar o que a frase mais quer dizer."],
        answer: {
          correctOptionLabel: null,
          expectedAnswer: {
            kind: "text",
            value: "As abelhas trabalham em equipe para fazer mel.",
            acceptedList: [],
          },
          computable: false,
          calculationExpression: null,
          solutionStepList: [],
          explanation: "A frase toda fala do trabalho em grupo das abelhas para fazer mel.",
          evidenceQuote: null,
        },
        commentary: "Procure sempre a frase que resume o texto.",
      },
      {
        exampleId: "e2",
        title: "Sentido da palavra",
        statement: "Na frase O gato é muito esperto, o que significa a palavra esperto?",
        table: null,
        stepList: ["Ler a frase inteira.", "Trocar a palavra por outra que mantenha o sentido."],
        answer: {
          correctOptionLabel: null,
          expectedAnswer: {
            kind: "text",
            value: "Inteligente.",
            acceptedList: ["Sabido."],
          },
          computable: false,
          calculationExpression: null,
          solutionStepList: [],
          explanation: "Esperto, nessa frase, quer dizer que o gato é inteligente.",
          evidenceQuote: null,
        },
        commentary: "O sentido de uma palavra depende da frase em que ela aparece.",
      },
    ],
    baseTextList: [
      {
        baseTextId: "t1",
        title: "A viagem da turma",
        paragraphList: paragraphsOf(tripSentenceList),
      },
      {
        baseTextId: "t2",
        title: "A horta da escola",
        paragraphList: paragraphsOf(gardenSentenceList),
      },
      {
        baseTextId: "t3",
        title: "O jabuti paciente",
        paragraphList: paragraphsOf(turtleSentenceList),
      },
    ],
    practiceQuestionList: questionList.slice(0, 10),
    mockQuestionList: questionList.slice(10),
    mockSuggestedMinutes: 45,
    studyTip: "Leia o texto inteiro antes de responder às perguntas.",
  });
  const studyKit = composeFixture("portuguese", kitSlotPlan, plan, content);
  if (studyKit.subject !== "portuguese") throw new Error("fixture subject");
  return {
    kitSlotPlan,
    plan,
    content,
    studyKit,
    mathEvaluator: createTableMathEvaluator(new Map()),
  };
}

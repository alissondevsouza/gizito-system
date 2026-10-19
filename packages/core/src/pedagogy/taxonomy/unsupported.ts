import { z } from "zod";
import { type Subject, subjectSchema } from "#src/enums.ts";
import { topicIdSchema } from "#src/order/schemas.ts";
import {
  TOPIC_DESCRIPTION_MAX_LENGTH,
  TOPIC_LABEL_MAX_LENGTH,
  topicSubjectPrefixMap,
  uniqueListSchema,
} from "#src/pedagogy/taxonomy/schemas.ts";

export const UNSUPPORTED_RECOGNITION_CUE_MAX_LENGTH = 240;

export const unsupportedTopicReasonList = ["figure", "orality", "open_writing"] as const;
export const unsupportedTopicReasonSchema = z.enum(unsupportedTopicReasonList);
export type UnsupportedTopicReason = z.infer<typeof unsupportedTopicReasonSchema>;

export const unsupportedTopicReasonLabelMap: Readonly<Record<UnsupportedTopicReason, string>> = {
  figure: "depende de figura ou imagem",
  orality: "depende de fala",
  open_writing: "depende de correção de texto livre",
};

export function normalizeKeywordText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const keywordSchema = z
  .string()
  .min(2)
  .refine((keyword) => keyword === normalizeKeywordText(keyword), {
    message: "keyword must be normalized",
  });

export const unsupportedTopicIdSchema = topicIdSchema.regex(/^(?:ma|lp)-[a-z0-9]+(?:-[a-z0-9]+)*$/);
export type UnsupportedTopicId = z.infer<typeof unsupportedTopicIdSchema>;

export const unsupportedTopicSchema = z
  .strictObject({
    unsupportedTopicId: unsupportedTopicIdSchema,
    subject: subjectSchema,
    label: z.string().trim().min(3).max(TOPIC_LABEL_MAX_LENGTH),
    description: z.string().trim().min(10).max(TOPIC_DESCRIPTION_MAX_LENGTH),
    reason: unsupportedTopicReasonSchema,
    recognitionCue: z.string().trim().min(10).max(UNSUPPORTED_RECOGNITION_CUE_MAX_LENGTH),
    keywordList: uniqueListSchema(keywordSchema).min(1),
  })
  .refine(
    (topic) => topic.unsupportedTopicId.startsWith(`${topicSubjectPrefixMap[topic.subject]}-`),
    { message: "unsupportedTopicId prefix must match the subject", path: ["unsupportedTopicId"] },
  );
export type UnsupportedTopic = z.infer<typeof unsupportedTopicSchema>;

export const unsupportedTopicList: readonly UnsupportedTopic[] = [
  {
    unsupportedTopicId: "ma-grid-symmetry",
    subject: "math",
    label: "Simetria desenhada em malha",
    description:
      "Simetria de reflexão, translação e rotação desenhada em malha (a simetria por coordenadas do 7º ano entra)",
    reason: "figure",
    recognitionCue:
      "Figuras para espelhar, completar, girar ou deslocar em malha ou papel quadriculado, com eixo de simetria desenhado. Simétrico de ponto dado por coordenadas é atendido.",
    keywordList: [
      "simetria",
      "simetrico",
      "simetrica",
      "simetricos",
      "simetricas",
      "reflexao",
      "translacao",
      "rotacao",
    ],
  },
  {
    unsupportedTopicId: "ma-grid-scaling",
    subject: "math",
    label: "Ampliação e redução em malha",
    description: "Ampliação e redução de figuras em malha quadriculada",
    reason: "figure",
    recognitionCue:
      "Figuras desenhadas em malha para ampliar, reduzir ou copiar em outra malha, comparando os tamanhos dos desenhos.",
    keywordList: [
      "malha",
      "ampliacao de figura",
      "ampliacao de figuras",
      "reducao de figura",
      "reducao de figuras",
      "ampliar figura",
      "ampliar figuras",
      "reduzir figura",
      "reduzir figuras",
    ],
  },
  {
    unsupportedTopicId: "ma-views-plans",
    subject: "math",
    label: "Vistas, plantas e croquis",
    description: "Vistas, plantas baixas e croquis",
    reason: "figure",
    recognitionCue:
      "Desenhos de objetos vistos de frente, de lado ou de cima, plantas de casa ou de sala, maquetes e croquis de trajeto para interpretar.",
    keywordList: [
      "vistas",
      "vista frontal",
      "vista lateral",
      "vista superior",
      "planta baixa",
      "plantas baixas",
      "croqui",
      "croquis",
      "maquete",
      "maquetes",
    ],
  },
  {
    unsupportedTopicId: "ma-flowcharts",
    subject: "math",
    label: "Algoritmos e fluxogramas",
    description: "Algoritmos e fluxogramas",
    reason: "figure",
    recognitionCue:
      "Diagramas de caixas e setas que representam os passos de um procedimento. O algoritmo usual das operações (conta armada) é atendido.",
    keywordList: ["fluxograma", "fluxogramas"],
  },
  {
    unsupportedTopicId: "lp-image-genres",
    subject: "portuguese",
    label: "Quadrinhos, tirinhas e charges",
    description:
      "Histórias em quadrinhos, tirinhas, charges, cartuns e anúncios que dependem da imagem",
    reason: "figure",
    recognitionCue:
      "Quadrinhos com balões, tirinhas, charges, cartuns, memes ou anúncios em que o sentido depende do desenho ou da foto. Texto escrito sem imagem é atendido.",
    keywordList: [
      "tirinha",
      "tirinhas",
      "quadrinho",
      "quadrinhos",
      "hq",
      "hqs",
      "gibi",
      "gibis",
      "charge",
      "charges",
      "cartum",
      "cartuns",
      "cartoon",
      "meme",
      "memes",
    ],
  },
  {
    unsupportedTopicId: "lp-orality",
    subject: "portuguese",
    label: "Oralidade, vídeo e podcast",
    description: "Oralidade, exposição oral, declamação e produção de vídeo ou podcast",
    reason: "orality",
    recognitionCue:
      "Propostas de apresentar, declamar, debater ou ler em voz alta, roteiros de seminário, de vídeo ou de podcast.",
    keywordList: [
      "oralidade",
      "exposicao oral",
      "apresentacao oral",
      "seminario",
      "seminarios",
      "declamacao",
      "declamar",
      "sarau",
      "debate",
      "debates",
      "leitura em voz alta",
      "podcast",
      "podcasts",
      "video",
      "videos",
      "vlog",
    ],
  },
  {
    unsupportedTopicId: "lp-essay-writing",
    subject: "portuguese",
    label: "Redação e produção de texto",
    description: "Produção de texto avaliada como redação",
    reason: "open_writing",
    recognitionCue:
      "Propostas de escrita livre (redação, escrever um conto, uma carta ou uma notícia) para corrigir como texto do aluno. Ler e analisar esses gêneros é atendido.",
    keywordList: [
      "redacao",
      "redacoes",
      "producao de texto",
      "producao textual",
      "escrever um texto",
      "escrita de texto",
    ],
  },
];

export function findUnsupportedTopicList(
  text: string,
  subject: Subject,
): readonly UnsupportedTopic[] {
  const paddedText = ` ${normalizeKeywordText(text)} `;
  return unsupportedTopicList.filter(
    (topic) =>
      topic.subject === subject &&
      topic.keywordList.some((keyword) => paddedText.includes(` ${keyword} `)),
  );
}

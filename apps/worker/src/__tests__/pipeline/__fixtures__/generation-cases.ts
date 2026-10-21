import type { Grade, PerceivedDifficulty, Subject, TopicRef } from "@gizito/core";

export type GenerationCase = {
  readonly caseId: string;
  readonly fileName: string;
  readonly sha256: string;
  readonly grade: Grade;
  readonly subject: Subject;
  readonly topicRefList: readonly TopicRef[];
  readonly perceivedDifficulty: PerceivedDifficulty | null;
  readonly noteText: string | null;
  readonly otherTopicText: string | null;
};

export const generationCaseList: readonly GenerationCase[] = [
  {
    caseId: "4-math-adicao-valor-posicional-basica",
    fileName: "4-matematica-adicao-e-subtracao.png",
    sha256: "26f49a819aec56e39549d5754818ef9915076a14416aa0117676843126751c5a",
    grade: "4",
    subject: "math",
    topicRefList: ["ma4-addition-subtraction", "ma4-place-value"],
    perceivedDifficulty: "basic",
    noteText: null,
    otherTopicText: null,
  },
  {
    caseId: "4-portuguese-pontuacao",
    fileName: "4-portugues-pontuacao.png",
    sha256: "bd40943353887cd07dc9a50462c6c924469525829d27690ba730d1fd5379edd9",
    grade: "4",
    subject: "portuguese",
    topicRefList: ["lp4-punctuation"],
    perceivedDifficulty: null,
    noteText: null,
    otherTopicText: null,
  },
  {
    caseId: "5-math-divisao-com-outro",
    fileName: "5-matematica-divisao.png",
    sha256: "0672624dbdcc2fcee8a658a97f56180bce6d46fbfe534d8ff98c893f1d77b852",
    grade: "5",
    subject: "math",
    topicRefList: ["ma5-multiplication-division", "other"],
    perceivedDifficulty: null,
    noteText: null,
    otherTopicText: "problemas com dinheiro e troco",
  },
  {
    caseId: "5-math-fracoes-decimais-perimetro",
    fileName: "5-matematica-fracoes-decimais-e-perimetro.png",
    sha256: "fb41aa623b2d67d402158fc658f8bc7f727a7d690a5d330b0ed9562b7afc9d88",
    grade: "5",
    subject: "math",
    topicRefList: ["ma5-equivalent-fractions", "ma5-decimal-numbers", "ma5-perimeter-area"],
    perceivedDifficulty: null,
    noteText: null,
    otherTopicText: null,
  },
  {
    caseId: "5-portuguese-informacao-explicita-com-observacao",
    fileName: "5-portugues-interpretacao-e-producao-textual.png",
    sha256: "de3a436aa1f91c2758e510dc237bf47b3302f38ec4a81e725a06fc96c202734e",
    grade: "5",
    subject: "portuguese",
    topicRefList: ["lp5-explicit-information"],
    perceivedDifficulty: null,
    noteText: "Ela lê rápido demais e responde sem voltar ao texto.",
    otherTopicText: null,
  },
  {
    caseId: "6-math-angulos",
    fileName: "6-matematica-angulos.png",
    sha256: "512a70968d01baa0e2d7a9faad86f10653a81aaa4c394c2ea1ea1e56d6034bb4",
    grade: "6",
    subject: "math",
    topicRefList: ["ma6-angles"],
    perceivedDifficulty: null,
    noteText: null,
    otherTopicText: null,
  },
  {
    caseId: "6-portuguese-substantivos-formacao",
    fileName: "6-portugues-substantivos-primitivos-derivados-coletivos.png",
    sha256: "df25efbda7524830bda2e2e417e104b01cef4f344a83b27b9e8c269cd1dcdbe4",
    grade: "6",
    subject: "portuguese",
    topicRefList: ["lp6-nouns", "lp6-word-formation"],
    perceivedDifficulty: null,
    noteText: null,
    otherTopicText: null,
  },
  {
    caseId: "7-math-inteiros-racionais-intermediaria",
    fileName: "7-matematica-numeros-inteiros-e-fracoes.png",
    sha256: "b2f27f13f02615103ba69222c8613b5cf165d41707b204bd932b0887753963a6",
    grade: "7",
    subject: "math",
    topicRefList: ["ma7-integer-addition-subtraction", "ma7-rational-operations"],
    perceivedDifficulty: "intermediate",
    noteText: null,
    otherTopicText: null,
  },
  {
    caseId: "7-math-equacoes-porcentagem",
    fileName: "7-matematica-equacoes-porcentagem-e-geometria.png",
    sha256: "28e8ed9d5ea8d228520ba6f4a4ea40fb9355414bf52b7a8f1fe52d3a2f40c421",
    grade: "7",
    subject: "math",
    topicRefList: ["ma7-linear-equations", "ma7-percentage"],
    perceivedDifficulty: null,
    noteText: null,
    otherTopicText: null,
  },
  {
    caseId: "7-portuguese-figuras-de-linguagem",
    fileName: "7-portugues-figuras-de-linguagem.png",
    sha256: "ce2ae3a1caf5d1ac3cc2c2f8c4886f982410a9da121b19a0442f8b1b0af9d5a3",
    grade: "7",
    subject: "portuguese",
    topicRefList: ["lp7-figures-of-speech"],
    perceivedDifficulty: null,
    noteText: null,
    otherTopicText: null,
  },
];

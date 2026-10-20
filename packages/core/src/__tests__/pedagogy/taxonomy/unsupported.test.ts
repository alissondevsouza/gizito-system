import { describe, expect, it } from "bun:test";
import { taxonomyTopicList } from "#src/pedagogy/taxonomy/index.ts";
import {
  findUnsupportedTopicList,
  normalizeKeywordText,
  type UnsupportedTopic,
  unsupportedTopicList,
  unsupportedTopicReasonLabelMap,
  unsupportedTopicReasonList,
  unsupportedTopicSchema,
} from "#src/pedagogy/taxonomy/unsupported.ts";

function buildUnsupportedTopic(overrides: Partial<UnsupportedTopic> = {}): UnsupportedTopic {
  return {
    unsupportedTopicId: "lp-image-genres",
    subject: "portuguese",
    label: "Quadrinhos e tirinhas",
    description: "Histórias em quadrinhos e tirinhas que dependem da imagem",
    reason: "figure",
    recognitionCue: "Quadrinhos com balões de fala e tirinhas desenhadas.",
    keywordList: ["tirinha", "historia em quadrinhos"],
    ...overrides,
  };
}

function idListOf(text: string, subject: "math" | "portuguese"): string[] {
  return findUnsupportedTopicList(text, subject).map((topic) => topic.unsupportedTopicId);
}

describe("unsupportedTopicSchema (PRD §7.7)", () => {
  it("aceita uma área completa", () => {
    expect(unsupportedTopicSchema.safeParse(buildUnsupportedTopic()).success).toBe(true);
  });

  it("rejeita id com ano ou de outra disciplina, textos fora do limite e palavras inválidas", () => {
    const invalidList: Partial<UnsupportedTopic>[] = [
      { unsupportedTopicId: "lp6-image-genres" },
      { unsupportedTopicId: "ma-image-genres" },
      { unsupportedTopicId: "lp-Image_Genres" },
      { label: "x".repeat(41) },
      { description: "curta" },
      { recognitionCue: "x".repeat(241) },
      { keywordList: [] },
      { keywordList: ["Tirinha"] },
      { keywordList: ["tirinhá"] },
      { keywordList: ["tirinha  dupla"] },
      { keywordList: ["tirinha", "tirinha"] },
      { keywordList: ["x"] },
    ];
    for (const overrides of invalidList) {
      expect(unsupportedTopicSchema.safeParse(buildUnsupportedTopic(overrides)).success).toBe(
        false,
      );
    }
    expect(
      unsupportedTopicSchema.safeParse({ ...buildUnsupportedTopic(), note: "extra" }).success,
    ).toBe(false);
  });

  it("todo motivo tem rótulo pt-BR", () => {
    for (const reason of unsupportedTopicReasonList) {
      expect(unsupportedTopicReasonLabelMap[reason].length).toBeGreaterThan(5);
    }
  });
});

describe("lista de assuntos ainda não atendidos", () => {
  it("cada área passa no schema e tem id único, sem colidir com a taxonomia", () => {
    for (const topic of unsupportedTopicList) {
      expect(unsupportedTopicSchema.safeParse(topic).success).toBe(true);
    }
    const idList = unsupportedTopicList.map((topic) => topic.unsupportedTopicId);
    expect(new Set(idList).size).toBe(idList.length);
    const taxonomyIdSet = new Set(taxonomyTopicList.map((topic) => topic.topicId));
    expect(idList.filter((topicId) => taxonomyIdSet.has(topicId))).toEqual([]);
  });

  it("nenhuma palavra se repete entre áreas da mesma disciplina", () => {
    for (const subject of ["math", "portuguese"] as const) {
      const keywordList = unsupportedTopicList
        .filter((topic) => topic.subject === subject)
        .flatMap((topic) => topic.keywordList);
      expect(new Set(keywordList).size).toBe(keywordList.length);
    }
  });

  it("mantém as 7 áreas aprovadas pelo professor na F1-01", () => {
    expect(unsupportedTopicList.map((topic) => topic.unsupportedTopicId)).toEqual([
      "ma-grid-symmetry",
      "ma-grid-scaling",
      "ma-views-plans",
      "ma-flowcharts",
      "lp-image-genres",
      "lp-orality",
      "lp-essay-writing",
    ]);
  });
});

describe("normalizeKeywordText", () => {
  it("tira acento, põe em minúsculas e troca pontuação por um espaço", () => {
    expect(normalizeKeywordText("  Produção   de TEXTO! ")).toBe("producao de texto");
    expect(normalizeKeywordText("Redação/HQ")).toBe("redacao hq");
    expect(normalizeKeywordText("Ç ã é í ô ü")).toBe("c a e i o u");
  });
});

describe("findUnsupportedTopicList (reconhecimento do “outro”)", () => {
  it("acha a área pela palavra inteira, sem acento nem maiúscula", () => {
    expect(idListOf("tirinhas da Mônica", "portuguese")).toEqual(["lp-image-genres"]);
    expect(idListOf("Tirinha", "portuguese")).toEqual(["lp-image-genres"]);
    expect(idListOf("interpretação de HQ", "portuguese")).toEqual(["lp-image-genres"]);
    expect(idListOf("Redação", "portuguese")).toEqual(["lp-essay-writing"]);
    expect(idListOf("produção de texto narrativo", "portuguese")).toEqual(["lp-essay-writing"]);
    expect(idListOf("produção de textos", "portuguese")).toEqual(["lp-essay-writing"]);
    expect(idListOf("seminário sobre o meio ambiente", "portuguese")).toEqual(["lp-orality"]);
    expect(idListOf("simetria", "math")).toEqual(["ma-grid-symmetry"]);
    expect(idListOf("figuras na malha quadriculada", "math")).toEqual(["ma-grid-scaling"]);
    expect(idListOf("planta baixa da casa", "math")).toEqual(["ma-views-plans"]);
    expect(idListOf("fluxograma", "math")).toEqual(["ma-flowcharts"]);
  });

  it("devolve todas as áreas citadas, na ordem da lista", () => {
    expect(idListOf("tirinha e redação", "portuguese")).toEqual([
      "lp-image-genres",
      "lp-essay-writing",
    ]);
  });

  it("só casa na disciplina do pedido", () => {
    expect(idListOf("tirinha", "math")).toEqual([]);
    expect(idListOf("reflexão sobre o texto", "portuguese")).toEqual([]);
  });

  it("rótulo e descrição de assunto atendido só disparam a recusa nas colisões aceitas na F1-02", () => {
    const acceptedCollisionIdList = ["ma7-cartesian-symmetry", "lp7-verb-moods"];
    const collisionIdList = taxonomyTopicList
      .filter(
        (topic) =>
          findUnsupportedTopicList(topic.label, topic.subject).length > 0 ||
          findUnsupportedTopicList(topic.description, topic.subject).length > 0,
      )
      .map((topic) => topic.topicId);
    expect(collisionIdList).toEqual(acceptedCollisionIdList);
  });

  it("não recusa assunto atendido nem palavra que só contém a chave", () => {
    expect(idListOf("algoritmo da divisão", "math")).toEqual([]);
    expect(idListOf("frações equivalentes", "math")).toEqual([]);
    expect(idListOf("malhação", "math")).toEqual([]);
    expect(idListOf("ampliação do vocabulário", "portuguese")).toEqual([]);
    expect(idListOf("carta pessoal", "portuguese")).toEqual([]);
    expect(idListOf("chargeback", "portuguese")).toEqual([]);
    expect(idListOf("", "portuguese")).toEqual([]);
  });
});

import { describe, expect, it } from "bun:test";
import { orderTransitionList } from "#src/order/state-machine.ts";
import {
  EVIDENCE_DROPPED_TEXT,
  mergedExtractionSchema,
  mergePhotoExtractionList,
  sanitizePhotoExtraction,
} from "#src/pedagogy/extraction/merge.ts";
import { decidePreviewOutcome } from "#src/pedagogy/extraction/preview.ts";
import {
  type MaterialProfile,
  type PhotoExtraction,
  photoExtractionSchema,
  type TopicCandidate,
} from "#src/pedagogy/extraction/schemas.ts";
import { listTopics } from "#src/pedagogy/taxonomy/index.ts";

const context = { grade: "5", subject: "math" } as const;

function buildProfile(override: Partial<MaterialProfile> = {}): MaterialProfile {
  return {
    exerciseFormatList: ["computation"],
    notationList: ["fraction_slash"],
    terminologyList: ["numerador"],
    contextThemeList: ["compras no mercado"],
    apparentLevel: "at_grade",
    hasFigures: false,
    isHandwritten: false,
    ...override,
  };
}

function candidate(topicId: string, confidence: "high" | "medium" = "high"): TopicCandidate {
  return { topicId, confidence, evidence: "título da página e seis contas" };
}

function buildExtraction(override: Partial<PhotoExtraction> = {}): PhotoExtraction {
  return {
    legibility: "good",
    isSchoolMaterial: true,
    photoIssueList: [],
    topicCandidateList: [candidate("ma5-fractions")],
    unsupportedTopicIdList: [],
    materialProfile: buildProfile(),
    sourceWarningCodeList: [],
    ...override,
  };
}

describe("photoExtractionSchema (spec pedagógica §3.1)", () => {
  it("aceita a fixture válida e candidato de outro ano (descartado só na junção)", () => {
    expect(photoExtractionSchema.safeParse(buildExtraction()).success).toBe(true);
    expect(
      photoExtractionSchema.safeParse(
        buildExtraction({ topicCandidateList: [candidate("ma7-integers")] }),
      ).success,
    ).toBe(true);
  });

  it.each<[string, unknown]>([
    [
      "topicId repetido",
      buildExtraction({
        topicCandidateList: [candidate("ma5-fractions"), candidate("ma5-fractions", "medium")],
      }),
    ],
    [
      "7 candidatos",
      buildExtraction({
        topicCandidateList: listTopics("5", "math")
          .slice(0, 7)
          .map((topic) => candidate(topic.topicId)),
      }),
    ],
    [
      "evidence de 9 caracteres",
      buildExtraction({
        topicCandidateList: [{ ...candidate("ma5-fractions"), evidence: "x".repeat(9) }],
      }),
    ],
    [
      "evidence de 121 caracteres",
      buildExtraction({
        topicCandidateList: [{ ...candidate("ma5-fractions"), evidence: "x".repeat(121) }],
      }),
    ],
    [
      "aviso repetido",
      buildExtraction({ sourceWarningCodeList: ["grade_mismatch", "grade_mismatch"] }),
    ],
    ["chave a mais", { ...buildExtraction(), transcript: "texto do caderno" }],
    [
      "termo de 41 caracteres",
      buildExtraction({ materialProfile: buildProfile({ terminologyList: ["x".repeat(41)] }) }),
    ],
    [
      "11 termos",
      buildExtraction({
        materialProfile: buildProfile({
          terminologyList: Array.from({ length: 11 }, (_, index) => `termo ${index}`),
        }),
      }),
    ],
    ["legibilidade desconhecida", { ...buildExtraction(), legibility: "ok" }],
    ["não atendido fora do padrão", buildExtraction({ unsupportedTopicIdList: ["ma5-fractions"] })],
  ])("recusa %s", (_, value) => {
    expect(photoExtractionSchema.safeParse(value).success).toBe(false);
  });
});

describe("sanitizePhotoExtraction (spec pedagógica §3.3, passo 1)", () => {
  it("descarta assunto de outro ano, não atendido de outra disciplina e dado pessoal", () => {
    const sanitized = sanitizePhotoExtraction(
      buildExtraction({
        topicCandidateList: [
          candidate("ma7-integers"),
          { ...candidate("ma5-percentage"), evidence: "ligue (11) 98765-4321 para a professora" },
          candidate("ma5-fractions"),
        ],
        unsupportedTopicIdList: ["lp-image-genres", "ma-grid-symmetry", "ma-nao-existe"],
        materialProfile: buildProfile({
          terminologyList: ["numerador", "mae@casa.com.br"],
          contextThemeList: ["11987654321", "compras no mercado"],
        }),
      }),
      context,
    );
    expect(sanitized.extraction.topicCandidateList.map((item) => item.topicId)).toEqual([
      "ma5-percentage",
      "ma5-fractions",
    ]);
    expect(sanitized.extraction.topicCandidateList[0]?.evidence).toBe(EVIDENCE_DROPPED_TEXT);
    expect(sanitized.issueList[0]?.itemId).toBe("ma7-integers");
    expect(sanitized.extraction.unsupportedTopicIdList).toEqual(["ma-grid-symmetry"]);
    expect(sanitized.extraction.materialProfile.terminologyList).toEqual(["numerador"]);
    expect(sanitized.extraction.materialProfile.contextThemeList).toEqual(["compras no mercado"]);
    expect(sanitized.issueList.map((issue) => issue.code)).toEqual([
      "extraction_unknown_topic",
      "extraction_personal_data_dropped",
      "extraction_unknown_unsupported_topic",
      "extraction_unknown_unsupported_topic",
      "extraction_personal_data_dropped",
      "extraction_personal_data_dropped",
    ]);
    expect(
      sanitized.issueList.every((issue) => issue.excerpt === null && issue.note === null),
    ).toBe(true);
    expect(JSON.stringify(sanitized)).not.toContain("98765");
    expect(photoExtractionSchema.safeParse(sanitized.extraction).success).toBe(true);
    expect(sanitizePhotoExtraction(sanitized.extraction, context)).toEqual({
      extraction: sanitized.extraction,
      issueList: [],
    });
  });

  it("esvazia a notação em Língua Portuguesa", () => {
    const sanitized = sanitizePhotoExtraction(
      buildExtraction({ topicCandidateList: [candidate("lp5-main-idea")] }),
      { grade: "5", subject: "portuguese" },
    );
    expect(sanitized.extraction.materialProfile.notationList).toEqual([]);
    expect(sanitized.extraction.topicCandidateList).toHaveLength(1);
  });
});

describe("mergePhotoExtractionList (spec pedagógica §3.3)", () => {
  it("foto ilegível, que não é material escolar ou com saída inválida não contribui", () => {
    const merged = mergePhotoExtractionList(
      [
        buildExtraction({
          legibility: "unreadable",
          topicCandidateList: [candidate("ma5-percentage")],
          unsupportedTopicIdList: ["ma-flowcharts"],
          materialProfile: buildProfile({ isHandwritten: true }),
        }),
        buildExtraction({
          isSchoolMaterial: false,
          topicCandidateList: [candidate("ma5-volume")],
          materialProfile: buildProfile({ hasFigures: true }),
        }),
        null,
        buildExtraction(),
      ],
      context,
    );
    expect(merged.topicCandidateList).toEqual([
      { topicId: "ma5-fractions", confidence: "high", photoIndexList: [4] },
    ]);
    expect(merged.unsupportedTopicList).toEqual([]);
    expect(merged.materialProfile.isHandwritten).toBe(false);
    expect(merged.materialProfile.hasFigures).toBe(false);
    expect(merged.photoList.map((photo) => [photo.isUsable, photo.legibilityScore])).toEqual([
      [false, 0],
      [false, 1],
      [false, null],
      [true, 1],
    ]);
    expect(merged.issueList.map((issue) => issue.code)).toEqual(["extraction_output_invalid"]);
    expect(mergedExtractionSchema.safeParse(merged).success).toBe(true);
  });

  it("avisos internos vêm de toda foto com saída válida, utilizável ou não", () => {
    const merged = mergePhotoExtractionList(
      [
        buildExtraction({
          legibility: "unreadable",
          topicCandidateList: [candidate("ma7-integers")],
        }),
        buildExtraction(),
      ],
      context,
    );
    expect(merged.issueList.map((issue) => issue.code)).toEqual(["extraction_unknown_topic"]);
  });

  it("legibilityScore segue o mapa: good 1, partial 0,5, unreadable 0", () => {
    const merged = mergePhotoExtractionList(
      [
        buildExtraction({ legibility: "good" }),
        buildExtraction({ legibility: "partial" }),
        buildExtraction({ legibility: "unreadable" }),
      ],
      context,
    );
    expect(merged.photoList.map((photo) => photo.legibilityScore)).toEqual([1, 0.5, 0]);
    expect(merged.photoList.map((photo) => photo.isUsable)).toEqual([true, true, false]);
  });

  it("high vence medium e ordena por fotos, confiança, primeira foto, posição e taxonomia", () => {
    const merged = mergePhotoExtractionList(
      [
        buildExtraction({
          topicCandidateList: [
            candidate("ma5-volume", "medium"),
            candidate("ma5-percentage", "medium"),
            candidate("ma5-decimal-numbers", "medium"),
            candidate("ma5-fractions", "medium"),
          ],
        }),
        buildExtraction({
          topicCandidateList: [
            candidate("ma5-fractions", "high"),
            candidate("ma5-natural-numbers", "high"),
          ],
        }),
      ],
      context,
    );
    expect(merged.topicCandidateList).toEqual([
      { topicId: "ma5-fractions", confidence: "high", photoIndexList: [1, 2] },
      { topicId: "ma5-natural-numbers", confidence: "high", photoIndexList: [2] },
      { topicId: "ma5-volume", confidence: "medium", photoIndexList: [1] },
      { topicId: "ma5-percentage", confidence: "medium", photoIndexList: [1] },
      { topicId: "ma5-decimal-numbers", confidence: "medium", photoIndexList: [1] },
    ]);
  });

  it("taxonomia só desempata o que tem mesma foto e mesma posição", () => {
    const merged = mergePhotoExtractionList(
      [
        buildExtraction({ topicCandidateList: [candidate("ma5-percentage")] }),
        buildExtraction({ topicCandidateList: [candidate("ma5-fractions")] }),
      ],
      context,
    );
    expect(merged.topicCandidateList.map((item) => item.topicId)).toEqual([
      "ma5-percentage",
      "ma5-fractions",
    ]);
  });

  it("corta em MAX_TOPIC_CANDIDATE_COUNT", () => {
    const topicIdList = listTopics("5", "math").map((topic) => topic.topicId);
    const merged = mergePhotoExtractionList(
      [
        buildExtraction({ topicCandidateList: topicIdList.slice(0, 6).map((id) => candidate(id)) }),
        buildExtraction({ topicCandidateList: topicIdList.slice(6, 9).map((id) => candidate(id)) }),
      ],
      context,
    );
    expect(merged.topicCandidateList.map((item) => item.topicId)).toEqual(topicIdList.slice(0, 6));
  });

  it("une não atendidos e avisos com as fotos em que aparecem", () => {
    const merged = mergePhotoExtractionList(
      [
        buildExtraction({
          unsupportedTopicIdList: ["ma-flowcharts"],
          sourceWarningCodeList: ["personal_data_visible"],
        }),
        buildExtraction({
          legibility: "unreadable",
          unsupportedTopicIdList: ["ma-views-plans"],
          sourceWarningCodeList: ["personal_data_visible", "figure_dependent_content"],
        }),
        buildExtraction({ unsupportedTopicIdList: ["ma-flowcharts", "ma-grid-symmetry"] }),
      ],
      context,
    );
    expect(merged.unsupportedTopicList).toEqual([
      { unsupportedTopicId: "ma-grid-symmetry", photoIndexList: [3] },
      { unsupportedTopicId: "ma-flowcharts", photoIndexList: [1, 3] },
    ]);
    expect(merged.sourceWarningList).toEqual([
      { code: "personal_data_visible", photoIndexList: [1, 2] },
      { code: "figure_dependent_content", photoIndexList: [2] },
    ]);
  });

  it("perfil: listas sem repetição por maiúsculas, cortadas, e flags por qualquer foto", () => {
    const merged = mergePhotoExtractionList(
      [
        buildExtraction({
          materialProfile: buildProfile({
            exerciseFormatList: ["computation", "word_problem"],
            terminologyList: ["Numerador", "denominador"],
            contextThemeList: ["Compras", "escola", "praia"],
            isHandwritten: true,
          }),
        }),
        buildExtraction({
          materialProfile: buildProfile({
            exerciseFormatList: ["word_problem", "multiple_choice"],
            notationList: ["mixed_number", "fraction_slash"],
            terminologyList: ["numerador", "fração própria"],
            contextThemeList: ["compras", "festa", "zoológico", "feira"],
            hasFigures: true,
          }),
        }),
      ],
      context,
    );
    expect(merged.materialProfile).toEqual({
      exerciseFormatList: ["computation", "word_problem", "multiple_choice"],
      notationList: ["fraction_slash", "mixed_number"],
      terminologyList: ["Numerador", "denominador", "fração própria"],
      contextThemeList: ["Compras", "escola", "praia", "festa", "zoológico"],
      apparentLevel: "at_grade",
      hasFigures: true,
      isHandwritten: true,
    });
  });

  it("apparentLevel é o mais frequente; empate vira at_grade", () => {
    const withLevels = (...levelList: MaterialProfile["apparentLevel"][]) =>
      mergePhotoExtractionList(
        levelList.map((apparentLevel) =>
          buildExtraction({ materialProfile: buildProfile({ apparentLevel }) }),
        ),
        context,
      ).materialProfile.apparentLevel;
    expect(withLevels("below_grade", "below_grade", "at_grade")).toBe("below_grade");
    expect(withLevels("below_grade", "above_grade")).toBe("at_grade");
    expect(withLevels("above_grade")).toBe("above_grade");
    expect(withLevels()).toBe("at_grade");
  });

  it("Língua Portuguesa sai sem notação", () => {
    const merged = mergePhotoExtractionList(
      [buildExtraction({ topicCandidateList: [candidate("lp5-main-idea")] })],
      { grade: "5", subject: "portuguese" },
    );
    expect(merged.materialProfile.notationList).toEqual([]);
  });

  it("nada descartado aparece na saída", () => {
    const merged = mergePhotoExtractionList(
      [
        buildExtraction({
          topicCandidateList: [
            { ...candidate("ma5-fractions"), evidence: "telefone 11 98765-4321 na capa" },
          ],
          materialProfile: buildProfile({ terminologyList: ["123.456.789-09"] }),
        }),
      ],
      context,
    );
    const serialized = JSON.stringify(merged);
    expect(serialized).not.toContain("98765");
    expect(serialized).not.toContain("123.456");
    expect(merged.topicCandidateList).toEqual([
      { topicId: "ma5-fractions", confidence: "high", photoIndexList: [1] },
    ]);
    expect(decidePreviewOutcome(merged).outcome).toBe("preview_ready");
    expect(mergedExtractionSchema.safeParse(merged).success).toBe(true);
  });
});

describe("decidePreviewOutcome (spec pedagógica §3.3)", () => {
  const decide = (photoExtractionList: readonly (PhotoExtraction | null)[]) =>
    decidePreviewOutcome(mergePhotoExtractionList(photoExtractionList, context));

  it("nenhuma foto utilizável: photos_unreadable", () => {
    expect(decide([buildExtraction({ legibility: "unreadable" }), null])).toEqual({
      outcome: "analysis_failed",
      event: "analysis_failed",
      failCode: "photos_unreadable",
      isMaterialMismatch: false,
    });
  });

  it("ao menos um candidato: preview_ready, mesmo com não atendido junto", () => {
    expect(decide([buildExtraction({ unsupportedTopicIdList: ["ma-flowcharts"] })])).toEqual({
      outcome: "preview_ready",
      event: "analysis_succeeded",
    });
  });

  it("só não atendidos: only_unsupported_topics", () => {
    expect(
      decide([
        buildExtraction({ topicCandidateList: [], unsupportedTopicIdList: ["ma-flowcharts"] }),
      ]),
    ).toMatchObject({ failCode: "only_unsupported_topics", isMaterialMismatch: false });
  });

  it("nada encontrado: no_topic_found, com ou sem material de outra disciplina ou ano", () => {
    expect(decide([buildExtraction({ topicCandidateList: [] })])).toMatchObject({
      failCode: "no_topic_found",
      isMaterialMismatch: false,
    });
    for (const code of ["subject_mismatch", "grade_mismatch"] as const) {
      expect(
        decide([buildExtraction({ topicCandidateList: [], sourceWarningCodeList: [code] })]),
      ).toMatchObject({ failCode: "no_topic_found", isMaterialMismatch: true });
    }
  });

  it("os eventos existem na máquina de estados a partir de analyzing", () => {
    for (const event of ["analysis_succeeded", "analysis_failed"]) {
      expect(orderTransitionList.some((t) => t.from === "analyzing" && t.event === event)).toBe(
        true,
      );
    }
  });
});

import { describe, expect, it } from "bun:test";
import {
  ORDER_ID,
  PHOTO_ID,
  PUBLIC_TOKEN,
  SHORT_CODE,
} from "#src/__tests__/__fixtures__/entities.ts";
import { MAX_PHOTO_COUNT } from "#src/constants.ts";
import { orderStatusList } from "#src/enums.ts";
import { type OrderAnalysis, unavailableOrderAnalysis } from "#src/order/analysis.ts";
import {
  analysisFailureViewOf,
  createOrderResponseSchema,
  isPhotoReplaceableOrderStatus,
  kitPreview,
  orderViewSchema,
  photoAnalysisViewOf,
  photoStageOrderStatusList,
  postPhotoStageOrderStatusList,
  previewViewOf,
} from "#src/order/view.ts";
import type { MergedExtraction } from "#src/pedagogy/extraction/merge.ts";

const baseView = {
  publicToken: PUBLIC_TOKEN,
  shortCode: SHORT_CODE,
  grade: "5",
  subject: "math",
  insertDatetime: "2026-10-21T12:00:00.000Z",
} as const;

const photoView = {
  orderPhotoId: PHOTO_ID,
  photoIndex: 0,
  thumbnailUrl: `https://storage.example/photos/${ORDER_ID}/${PHOTO_ID}-thumbnail.jpg?X-Amz-Signature=abc`,
  legibilityScore: null,
  isUsable: null,
  photoIssueList: [],
};

const SECOND_PHOTO_ID = "66666666-6666-4666-8666-666666666666";

const mergedExtraction: MergedExtraction = {
  photoList: [
    { photoIndex: 1, legibility: "good", isUsable: true, legibilityScore: 1, photoIssueList: [] },
    {
      photoIndex: 2,
      legibility: "unreadable",
      isUsable: false,
      legibilityScore: 0,
      photoIssueList: ["blurry", "dark"],
    },
  ],
  topicCandidateList: [
    { topicId: "ma5-equivalent-fractions", confidence: "high", photoIndexList: [1] },
    { topicId: "ma5-fractions", confidence: "medium", photoIndexList: [1] },
  ],
  unsupportedTopicList: [{ unsupportedTopicId: "ma-grid-symmetry", photoIndexList: [1] }],
  sourceWarningList: [{ code: "personal_data_visible", photoIndexList: [1] }],
  materialProfile: {
    exerciseFormatList: ["computation", "word_problem"],
    notationList: ["fraction_slash"],
    terminologyList: ["numerador"],
    contextThemeList: ["compras no mercado"],
    apparentLevel: "at_grade",
    hasFigures: true,
    isHandwritten: true,
  },
  issueList: [],
};

const previewAnalysis: OrderAnalysis = {
  outcome: "preview_ready",
  analyzedPhotoIdList: [PHOTO_ID, SECOND_PHOTO_ID],
  mergedExtraction,
};

const failedAnalysis: OrderAnalysis = {
  outcome: "analysis_failed",
  failCode: "only_unsupported_topics",
  isMaterialMismatch: false,
  analyzedPhotoIdList: [PHOTO_ID, SECOND_PHOTO_ID],
  mergedExtraction: { ...mergedExtraction, topicCandidateList: [] },
};

describe("orderViewSchema (api.md §3)", () => {
  it("as duas listas de status particionam orderStatusList", () => {
    expect([...photoStageOrderStatusList, ...postPhotoStageOrderStatusList].sort()).toEqual(
      [...orderStatusList].sort(),
    );
  });

  it("draft, analyzing e preview_ready trazem photoList, vazia se as fotos já expiraram", () => {
    const stageFieldMap = {
      draft: { analysisFailure: null },
      analyzing: {},
      preview_ready: previewViewOf(previewAnalysis) ?? {},
    } as const;
    for (const status of photoStageOrderStatusList) {
      const stageView = { ...baseView, status, ...stageFieldMap[status] };
      expect(orderViewSchema.safeParse({ ...stageView, photoList: [photoView] }).success).toBe(
        true,
      );
      expect(orderViewSchema.safeParse({ ...stageView, photoList: [] }).success).toBe(true);
      expect(orderViewSchema.safeParse(stageView).success).toBe(false);
      expect(
        orderViewSchema.safeParse({
          ...stageView,
          photoList: Array.from({ length: MAX_PHOTO_COUNT + 1 }, () => photoView),
        }).success,
      ).toBe(false);
    }
  });

  it("draft exige analysisFailure, nula com a análise pendente", () => {
    const draft = { ...baseView, status: "draft", photoList: [photoView] };
    expect(orderViewSchema.safeParse(draft).success).toBe(false);
    expect(orderViewSchema.safeParse({ ...draft, analysisFailure: null }).success).toBe(true);
    expect(
      orderViewSchema.safeParse({
        ...draft,
        analysisFailure: analysisFailureViewOf(unavailableOrderAnalysis),
      }).success,
    ).toBe(true);
  });

  it("preview_ready exige ao menos um assunto e a composição do kit", () => {
    const preview = previewViewOf(previewAnalysis);
    const view = { ...baseView, status: "preview_ready", photoList: [photoView], ...preview };
    expect(orderViewSchema.safeParse(view).success).toBe(true);
    expect(orderViewSchema.safeParse({ ...view, topicCandidateList: [] }).success).toBe(false);
    expect(orderViewSchema.safeParse({ ...view, kitPreview: undefined }).success).toBe(false);
  });

  it("a view descarta texto do material que vier junto", () => {
    const preview = previewViewOf(previewAnalysis);
    const parsed = orderViewSchema.parse({
      ...baseView,
      status: "preview_ready",
      photoList: [photoView],
      ...preview,
      materialProfile: { ...mergedExtraction.materialProfile },
      topicCandidateList: [
        { topicId: "ma5-fractions", label: "Frações", confidence: "high", evidence: "trecho" },
      ],
    });
    const serialized = JSON.stringify(parsed);
    for (const leaked of ["evidence", "trecho", "terminologyList", "numerador", "contextTheme"]) {
      expect(serialized).not.toContain(leaked);
    }
  });

  it("depois da prévia, só os campos base", () => {
    for (const status of postPhotoStageOrderStatusList) {
      expect(orderViewSchema.safeParse({ ...baseView, status }).success).toBe(true);
    }
  });

  it("recusa token, data ou miniatura fora do formato", () => {
    const draft = { ...baseView, status: "draft", photoList: [photoView] };
    expect(orderViewSchema.safeParse({ ...draft, publicToken: "curto" }).success).toBe(false);
    expect(orderViewSchema.safeParse({ ...draft, insertDatetime: "ontem" }).success).toBe(false);
    expect(
      orderViewSchema.safeParse({
        ...draft,
        photoList: [{ ...photoView, thumbnailUrl: "ftp://x" }],
      }).success,
    ).toBe(false);
  });
});

describe("createOrderResponseSchema", () => {
  it("o pedido nasce em draft", () => {
    const created = { publicToken: PUBLIC_TOKEN, shortCode: SHORT_CODE, status: "draft" };
    expect(createOrderResponseSchema.safeParse(created).success).toBe(true);
    expect(createOrderResponseSchema.safeParse({ ...created, status: "analyzing" }).success).toBe(
      false,
    );
  });
});

describe("isPhotoReplaceableOrderStatus (design doc §6.3, Trocar foto)", () => {
  it("aceita só draft e preview_ready", () => {
    const replaceableList = orderStatusList.filter(isPhotoReplaceableOrderStatus);
    expect(replaceableList).toEqual(["draft", "preview_ready"]);
  });
});

describe("montagem da prévia (spec F2-02, RF-10)", () => {
  it("cada foto analisada mostra se é utilizável e por quê; sem análise, null", () => {
    expect(photoAnalysisViewOf(previewAnalysis, SECOND_PHOTO_ID)).toEqual({
      isUsable: false,
      photoIssueList: ["blurry", "dark"],
    });
    expect(photoAnalysisViewOf(previewAnalysis, PHOTO_ID)).toEqual({
      isUsable: true,
      photoIssueList: [],
    });
    expect(photoAnalysisViewOf(previewAnalysis, ORDER_ID)).toEqual({
      isUsable: null,
      photoIssueList: [],
    });
    expect(photoAnalysisViewOf(null, PHOTO_ID).isUsable).toBeNull();
    expect(photoAnalysisViewOf(unavailableOrderAnalysis, PHOTO_ID).isUsable).toBeNull();
  });

  it("a prévia traz rótulo da taxonomia, não atendidos, perfil resumido e o kit do core", () => {
    expect(previewViewOf(previewAnalysis)).toEqual({
      topicCandidateList: [
        {
          topicId: "ma5-equivalent-fractions",
          label: expect.any(String),
          confidence: "high",
        },
        { topicId: "ma5-fractions", label: expect.any(String), confidence: "medium" },
      ],
      unsupportedTopicList: [
        { unsupportedTopicId: "ma-grid-symmetry", label: expect.any(String), reason: "figure" },
      ],
      materialProfile: {
        exerciseFormatList: ["computation", "word_problem"],
        notationList: ["fraction_slash"],
        isHandwritten: true,
      },
      kitPreview,
    });
    expect(kitPreview).toEqual({
      workedExampleCount: 2,
      practiceQuestionCount: 10,
      mockQuestionCount: 10,
      answerKeyCount: 20,
      priceCents: 2990,
    });
    expect(previewViewOf(failedAnalysis)).toBeNull();
  });

  it("a falha traz código, mismatch e os não atendidos; prévia pronta ou pendente não é falha", () => {
    expect(analysisFailureViewOf(failedAnalysis)).toEqual({
      failCode: "only_unsupported_topics",
      isMaterialMismatch: false,
      unsupportedTopicList: [
        { unsupportedTopicId: "ma-grid-symmetry", label: expect.any(String), reason: "figure" },
      ],
    });
    expect(analysisFailureViewOf(unavailableOrderAnalysis)).toEqual({
      failCode: "analysis_unavailable",
      isMaterialMismatch: false,
      unsupportedTopicList: [],
    });
    expect(analysisFailureViewOf(previewAnalysis)).toBeNull();
    expect(analysisFailureViewOf(null)).toBeNull();
  });
});

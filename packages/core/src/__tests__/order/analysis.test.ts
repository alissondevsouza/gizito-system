import { describe, expect, it } from "bun:test";
import { PHOTO_ID } from "#src/__tests__/__fixtures__/entities.ts";
import { orderStatusList } from "#src/enums.ts";
import {
  analysisEventOf,
  analysisFailCodeList,
  buildOrderAnalysis,
  decideAnalysisStart,
  orderAnalysisSchema,
  unavailableOrderAnalysis,
} from "#src/order/analysis.ts";
import { transitionOrder } from "#src/order/state-machine.ts";
import type { MergedExtraction } from "#src/pedagogy/extraction/merge.ts";
import { previewFailCodeList } from "#src/pedagogy/extraction/preview.ts";

const SECOND_PHOTO_ID = "66666666-6666-4666-8666-666666666666";

const mergedExtraction: MergedExtraction = {
  photoList: [
    {
      photoIndex: 1,
      legibility: "good",
      isUsable: true,
      legibilityScore: 1,
      photoIssueList: [],
    },
    {
      photoIndex: 2,
      legibility: "unreadable",
      isUsable: false,
      legibilityScore: 0,
      photoIssueList: ["blurry"],
    },
  ],
  topicCandidateList: [
    { topicId: "ma5-equivalent-fractions", confidence: "high", photoIndexList: [1] },
  ],
  unsupportedTopicList: [],
  sourceWarningList: [],
  materialProfile: {
    exerciseFormatList: ["computation"],
    notationList: ["fraction_slash"],
    terminologyList: ["numerador"],
    contextThemeList: [],
    apparentLevel: "at_grade",
    hasFigures: false,
    isHandwritten: true,
  },
  issueList: [],
};

const photoIdList = [PHOTO_ID, SECOND_PHOTO_ID];

describe("orderAnalysisSchema (spec F2-02, RF-03)", () => {
  it("aceita os três desfechos", () => {
    for (const analysis of [
      { outcome: "preview_ready", analyzedPhotoIdList: photoIdList, mergedExtraction },
      {
        outcome: "analysis_failed",
        failCode: "no_topic_found",
        isMaterialMismatch: true,
        analyzedPhotoIdList: photoIdList,
        mergedExtraction,
      },
      { outcome: "analysis_unavailable" },
    ]) {
      expect(orderAnalysisSchema.safeParse(analysis).success).toBe(true);
    }
  });

  it("recusa lista de fotos de tamanho diferente da junção, com id repetido ou vazia", () => {
    for (const analyzedPhotoIdList of [[PHOTO_ID], [PHOTO_ID, PHOTO_ID], []]) {
      expect(
        orderAnalysisSchema.safeParse({
          outcome: "preview_ready",
          analyzedPhotoIdList,
          mergedExtraction,
        }).success,
      ).toBe(false);
    }
  });

  it("recusa campo a mais, falha sem código e indisponível com junção", () => {
    expect(
      orderAnalysisSchema.safeParse({
        outcome: "preview_ready",
        analyzedPhotoIdList: photoIdList,
        mergedExtraction,
        failCode: "no_topic_found",
      }).success,
    ).toBe(false);
    expect(
      orderAnalysisSchema.safeParse({
        outcome: "analysis_failed",
        isMaterialMismatch: false,
        analyzedPhotoIdList: photoIdList,
        mergedExtraction,
      }).success,
    ).toBe(false);
    expect(
      orderAnalysisSchema.safeParse({ outcome: "analysis_unavailable", mergedExtraction }).success,
    ).toBe(false);
  });

  it("os códigos de falha são os da prévia mais analysis_unavailable", () => {
    expect(analysisFailCodeList).toEqual([...previewFailCodeList, "analysis_unavailable"]);
  });
});

describe("buildOrderAnalysis e analysisEventOf", () => {
  it("prévia pronta vira analysis_succeeded, que leva a preview_ready", () => {
    const analysis = buildOrderAnalysis(photoIdList, mergedExtraction, {
      outcome: "preview_ready",
      event: "analysis_succeeded",
    });
    expect(analysis.outcome).toBe("preview_ready");
    expect(analysisEventOf(analysis)).toBe("analysis_succeeded");
    expect(transitionOrder("analyzing", analysisEventOf(analysis))).toEqual({
      ok: true,
      value: "preview_ready",
    });
  });

  it("falha da prévia guarda código e mismatch e volta a draft", () => {
    const analysis = buildOrderAnalysis(photoIdList, mergedExtraction, {
      outcome: "analysis_failed",
      event: "analysis_failed",
      failCode: "only_unsupported_topics",
      isMaterialMismatch: false,
    });
    expect(analysis).toMatchObject({
      outcome: "analysis_failed",
      failCode: "only_unsupported_topics",
      isMaterialMismatch: false,
    });
    expect(transitionOrder("analyzing", analysisEventOf(analysis))).toEqual({
      ok: true,
      value: "draft",
    });
    expect(analysisEventOf(unavailableOrderAnalysis)).toBe("analysis_failed");
  });

  it("lança se a lista de fotos não bate com a junção", () => {
    expect(() =>
      buildOrderAnalysis([PHOTO_ID], mergedExtraction, {
        outcome: "preview_ready",
        event: "analysis_succeeded",
      }),
    ).toThrow();
  });
});

describe("decideAnalysisStart (spec F2-02, RF-04)", () => {
  it.each(orderStatusList.map((status) => [status] as const))(
    "%s com e sem análise gravada",
    (status) => {
      const withoutAnalysis = decideAnalysisStart(status, false);
      const withAnalysis = decideAnalysisStart(status, true);
      if (status === "draft") {
        expect(withoutAnalysis).toBe("start");
        expect(withAnalysis).toBe("skip");
      } else if (status === "analyzing") {
        expect(withoutAnalysis).toBe("resume");
        expect(withAnalysis).toBe("resume");
      } else {
        expect(withoutAnalysis).toBe("skip");
        expect(withAnalysis).toBe("skip");
      }
    },
  );
});

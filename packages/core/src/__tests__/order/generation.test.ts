import { describe, expect, it } from "bun:test";
import { PHOTO_ID } from "#src/__tests__/__fixtures__/entities.ts";
import { FIXTURE_MATERIAL_PROFILE } from "#src/__tests__/__fixtures__/kit-content.ts";
import { OTHER_TOPIC_REF } from "#src/constants.ts";
import { type OrderStatus, orderStatusList } from "#src/enums.ts";
import {
  aiFailureCodeList,
  aiProviderIncidentCodeList,
  isAiProviderIncidentCode,
  isRetryableAiFailureCode,
} from "#src/interfaces/ai-provider.ts";
import type { OrderAnalysis } from "#src/order/analysis.ts";
import {
  buildGenerationInput,
  decideGenerationStart,
  GENERATION_INPUT_INVALID_CODE,
  GenerationInputError,
  type GenerationOrderFields,
  type GenerationStartDecision,
  sourceWarningCodeListOf,
} from "#src/order/generation.ts";

const FRACTIONS_TOPIC_ID = "ma5-fractions";
const PERIMETER_TOPIC_ID = "ma5-perimeter-area";
const PORTUGUESE_TOPIC_ID = "lp5-accentuation";

const previewReadyAnalysis: OrderAnalysis = {
  outcome: "preview_ready",
  analyzedPhotoIdList: [PHOTO_ID],
  mergedExtraction: {
    photoList: [
      { photoIndex: 1, legibility: "good", isUsable: true, legibilityScore: 1, photoIssueList: [] },
    ],
    topicCandidateList: [{ topicId: FRACTIONS_TOPIC_ID, confidence: "high", photoIndexList: [1] }],
    unsupportedTopicList: [],
    sourceWarningList: [
      { code: "personal_data_visible", photoIndexList: [1] },
      { code: "figure_dependent_content", photoIndexList: [1] },
    ],
    materialProfile: FIXTURE_MATERIAL_PROFILE,
    issueList: [],
  },
};

function fieldsOf(overrides: Partial<GenerationOrderFields> = {}): GenerationOrderFields {
  return {
    grade: "5",
    subject: "math",
    topicIdList: [FRACTIONS_TOPIC_ID, PERIMETER_TOPIC_ID],
    otherTopicText: null,
    perceivedDifficulty: "basic",
    noteText: "troca numerador e denominador",
    materialProfile: FIXTURE_MATERIAL_PROFILE,
    analysis: previewReadyAnalysis,
    ...overrides,
  };
}

describe("decideGenerationStart (spec F2-05, RF-01)", () => {
  it("paid começa, processing retoma e os demais pulam", () => {
    const expectedByStatus: Record<OrderStatus, GenerationStartDecision> = {
      draft: "skip",
      analyzing: "skip",
      preview_ready: "skip",
      awaiting_payment: "skip",
      paid: "start",
      processing: "resume",
      ready: "skip",
      failed: "skip",
      refunded: "skip",
    };
    for (const status of orderStatusList) {
      expect(decideGenerationStart(status)).toBe(expectedByStatus[status]);
    }
  });
});

describe("buildGenerationInput (spec F2-05, RF-02)", () => {
  it("monta a entrada com os assuntos, o perfil e os avisos da análise", () => {
    const result = buildGenerationInput(fieldsOf());
    if (!result.ok) throw result.error;
    expect(result.value).toEqual({
      grade: "5",
      subject: "math",
      topicRefList: [FRACTIONS_TOPIC_ID, PERIMETER_TOPIC_ID],
      otherTopicText: null,
      perceivedDifficulty: "basic",
      noteText: "troca numerador e denominador",
      materialProfile: FIXTURE_MATERIAL_PROFILE,
      sourceWarningCodeList: ["personal_data_visible", "figure_dependent_content"],
    });
  });

  it("o outro entra por último na lista de referências", () => {
    const result = buildGenerationInput(
      fieldsOf({ topicIdList: [FRACTIONS_TOPIC_ID], otherTopicText: "problemas com troco" }),
    );
    if (!result.ok) throw result.error;
    expect(result.value.topicRefList).toEqual([FRACTIONS_TOPIC_ID, OTHER_TOPIC_REF]);
    expect(result.value.otherTopicText).toBe("problemas com troco");
  });

  it("só o outro também vale", () => {
    const result = buildGenerationInput(fieldsOf({ topicIdList: [], otherTopicText: "troco" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.topicRefList).toEqual([OTHER_TOPIC_REF]);
  });

  it.each([null, { exerciseFormatList: "nope" }, "perfil"])(
    "perfil do material %p é generation_input_invalid",
    (materialProfile) => {
      const result = buildGenerationInput(fieldsOf({ materialProfile }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(GenerationInputError);
      expect(result.error.code).toBe(GENERATION_INPUT_INVALID_CODE);
      expect(result.error.reason).toBe("material_profile_invalid");
    },
  );

  it("sem assunto e sem outro é generation_input_invalid", () => {
    const result = buildGenerationInput(fieldsOf({ topicIdList: [], otherTopicText: null }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe("topic_list_empty");
  });

  it("assunto de outra disciplina ou ano é generation_input_invalid", () => {
    const result = buildGenerationInput(fieldsOf({ topicIdList: [PORTUGUESE_TOPIC_ID] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe("topic_not_selectable");
  });

  it("sem análise, análise indisponível ou análise inválida dão avisos vazios", () => {
    expect(sourceWarningCodeListOf(null)).toEqual([]);
    expect(sourceWarningCodeListOf({ outcome: "analysis_unavailable" })).toEqual([]);
    expect(sourceWarningCodeListOf({ outcome: "preview_ready" })).toEqual([]);
    const result = buildGenerationInput(fieldsOf({ analysis: null }));
    if (!result.ok) throw result.error;
    expect(result.value.sourceWarningCodeList).toEqual([]);
  });
});

describe("incidente do provedor de IA (spec F2-05, RF-03)", () => {
  it("auth e request inválido são incidentes do operador, não retryable por si", () => {
    expect(aiProviderIncidentCodeList).toEqual(["ai_auth_failed", "ai_request_invalid"]);
    for (const code of aiProviderIncidentCodeList) {
      expect(isAiProviderIncidentCode(code)).toBe(true);
      expect(isRetryableAiFailureCode(code)).toBe(false);
      expect(aiFailureCodeList).toContain(code);
    }
    expect(isAiProviderIncidentCode("ai_output_invalid")).toBe(false);
    expect(isAiProviderIncidentCode("generation_blocked")).toBe(false);
  });
});

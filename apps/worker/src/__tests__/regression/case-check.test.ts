import { describe, expect, it } from "bun:test";
import {
  failureOf,
  photoExtractionOf,
  topicCandidateOf,
  unreadableExtraction,
} from "#src/__tests__/pipeline/__fixtures__/extraction.ts";
import { createFixtureAiProvider } from "#src/__tests__/pipeline/__fixtures__/generation.ts";
import {
  createCountingRenderer,
  FRACTIONS_TOPIC_ID,
  PERIMETER_TOPIC_ID,
  pipelineDependenciesOf,
  pipelineFixture,
  pipelineRequestOf,
} from "#src/__tests__/pipeline/__fixtures__/pipeline.ts";
import {
  fixtureRunOf,
  regressionCaseOf,
  SENTINEL_EVIDENCE,
  SENTINEL_TERM,
  sentinelExtraction,
} from "#src/__tests__/regression/__fixtures__/regression.ts";
import {
  checkRegressionCase,
  EMPTY_CASE_TEXT_REFERENCE,
  isMaterialCopied,
  isPersonalDataCopied,
} from "#src/regression/case-check.ts";
import type { RegressionCase } from "#src/regression/regression-case.ts";
import { runRegressionCase } from "#src/regression/run-case.ts";

function withPreview(override: Partial<RegressionCase["expectedPreview"]>): RegressionCase {
  const regressionCase = regressionCaseOf();
  return regressionCaseOf({ expectedPreview: { ...regressionCase.expectedPreview, ...override } });
}

async function readyOutcome() {
  return (await fixtureRunOf()).outcome;
}

describe("verificações do caso (spec F1-10, RF-05)", () => {
  it("caso que bate com a execução passa em todas as verificações", async () => {
    const check = checkRegressionCase(
      regressionCaseOf(),
      await readyOutcome(),
      EMPTY_CASE_TEXT_REFERENCE,
    );
    expect(check).toEqual({
      failedCheckList: [],
      expectedKitOutcome: "ready",
      warningList: [],
      actualPreview: { outcome: "preview_ready", failCode: null },
      actualKitOutcome: "ready",
    });
  });

  it("prévia diferente da esperada é preview_outcome_mismatch, e o kit pronto é kit_outcome_mismatch", async () => {
    const regressionCase = regressionCaseOf({
      expectedPreview: {
        ...regressionCaseOf().expectedPreview,
        outcome: "analysis_failed",
        failCode: "no_topic_found",
        requiredTopicIdList: [],
        acceptableTopicIdList: [FRACTIONS_TOPIC_ID, PERIMETER_TOPIC_ID],
      },
      expectedKitOutcome: "not_applicable",
    });
    const check = checkRegressionCase(
      regressionCase,
      await readyOutcome(),
      EMPTY_CASE_TEXT_REFERENCE,
    );
    expect(check.failedCheckList).toEqual(["preview_outcome_mismatch", "kit_outcome_mismatch"]);
  });

  it("obrigatório fora dos candidatos é required_topic_missing", async () => {
    const check = checkRegressionCase(
      withPreview({ requiredTopicIdList: [FRACTIONS_TOPIC_ID, "ma5-decimal-numbers"] }),
      await readyOutcome(),
      EMPTY_CASE_TEXT_REFERENCE,
    );
    expect(check.failedCheckList).toEqual(["required_topic_missing"]);
  });

  it("candidato high fora do esperado falha; medium fora do esperado é só aviso", async () => {
    const highCheck = checkRegressionCase(
      withPreview({ acceptableTopicIdList: [] }),
      await readyOutcome(),
      EMPTY_CASE_TEXT_REFERENCE,
    );
    expect(highCheck.failedCheckList).toEqual(["unexpected_topic"]);
    const mediumExtraction = photoExtractionOf({
      topicCandidateList: [
        topicCandidateOf(FRACTIONS_TOPIC_ID),
        topicCandidateOf(PERIMETER_TOPIC_ID, { confidence: "medium" }),
      ],
    });
    const mediumCheck = checkRegressionCase(
      withPreview({ acceptableTopicIdList: [] }),
      (
        await fixtureRunOf(mediumExtraction, {
          topicIdList: [FRACTIONS_TOPIC_ID, PERIMETER_TOPIC_ID],
        })
      ).outcome,
      EMPTY_CASE_TEXT_REFERENCE,
    );
    expect(mediumCheck.failedCheckList).toEqual([]);
    expect(mediumCheck.warningList).toEqual([`unexpected_topic_medium:${PERIMETER_TOPIC_ID}`]);
  });

  it("área não atendida esperada e não sinalizada é unsupported_topic_missed", async () => {
    const check = checkRegressionCase(
      withPreview({ unsupportedTopicIdList: ["ma-flowcharts"] }),
      await readyOutcome(),
      EMPTY_CASE_TEXT_REFERENCE,
    );
    expect(check.failedCheckList).toEqual(["unsupported_topic_missed"]);
  });

  it("foto esperada ilegível usada, ou foto esperada boa recusada, é legibility_mismatch", async () => {
    const expectedUnreadable = regressionCaseOf({
      photoList: [
        { fileName: "foto-1.png", sha256: "a".repeat(64), expectedLegibility: "unreadable" },
        { fileName: "foto-2.png", sha256: "a".repeat(64), expectedLegibility: "partial" },
      ],
    });
    expect(
      checkRegressionCase(expectedUnreadable, await readyOutcome(), EMPTY_CASE_TEXT_REFERENCE)
        .failedCheckList,
    ).toEqual(["legibility_mismatch"]);
    const refused = checkRegressionCase(
      regressionCaseOf(),
      (await fixtureRunOf(unreadableExtraction)).outcome,
      EMPTY_CASE_TEXT_REFERENCE,
    );
    expect(refused.actualPreview).toEqual({
      outcome: "analysis_failed",
      failCode: "photos_unreadable",
    });
    expect(refused.failedCheckList).toEqual([
      "preview_outcome_mismatch",
      "required_topic_missing",
      "legibility_mismatch",
      "kit_outcome_mismatch",
    ]);
    expect(refused.actualKitOutcome).toBe("not_applicable");
  });

  it("aviso da fonte exigido e ausente é source_warning_missed", async () => {
    const check = checkRegressionCase(
      withPreview({ requiredSourceWarningCodeList: ["personal_data_visible"] }),
      await readyOutcome(),
      EMPTY_CASE_TEXT_REFERENCE,
    );
    expect(check.failedCheckList).toEqual(["source_warning_missed"]);
  });

  it("texto inventado da variação na extração juntada é personal_data_copied", async () => {
    const check = checkRegressionCase(regressionCaseOf(), await readyOutcome(), {
      ...EMPTY_CASE_TEXT_REFERENCE,
      personalDataTextList: [SENTINEL_TERM.toLowerCase()],
    });
    expect(check.failedCheckList).toEqual(["personal_data_copied"]);
    expect(
      checkRegressionCase(regressionCaseOf(), await readyOutcome(), {
        ...EMPTY_CASE_TEXT_REFERENCE,
        personalDataTextList: ["Nome Nunca Copiado"],
      }).failedCheckList,
    ).toEqual([]);
  });

  it("a evidência por foto, que a extração juntada não guarda, também é conferida", async () => {
    const check = checkRegressionCase(regressionCaseOf(), await readyOutcome(), {
      ...EMPTY_CASE_TEXT_REFERENCE,
      personalDataTextList: [SENTINEL_EVIDENCE.toUpperCase()],
    });
    expect(check.failedCheckList).toEqual(["personal_data_copied"]);
  });

  it("telefone conta como copiado com qualquer separador entre os dígitos", () => {
    expect(isPersonalDataCopied('{"tema":"fone 11 98472.3610"}', ["(11) 98472-3610"])).toBe(true);
    expect(isPersonalDataCopied('{"tema":"fone 8472-3610"}', ["84723610"])).toBe(true);
    expect(isPersonalDataCopied('{"tema":"fone 11 98472"}', ["(11) 98472-3610"])).toBe(false);
  });

  it("palavra do nome conta como copiada só como palavra inteira, sem diferença de maiúsculas", () => {
    expect(isPersonalDataCopied('{"evidence":"caderno da RAFAELA"}', ["Rafaela"])).toBe(true);
    expect(isPersonalDataCopied('{"evidence":"Cecília Brandão"}', ["Cecília"])).toBe(true);
    expect(isPersonalDataCopied('{"evidence":"linhas e colunas"}', ["Lins"])).toBe(false);
    expect(isPersonalDataCopied('{"evidence":"Rafaelas"}', ["Rafaela"])).toBe(false);
  });

  it("frase do material na extração é material_copied", async () => {
    const check = checkRegressionCase(regressionCaseOf(), await readyOutcome(), {
      ...EMPTY_CASE_TEXT_REFERENCE,
      materialPhraseList: ["sentinela-evidencia do CADERNO"],
    });
    expect(check.failedCheckList).toEqual(["material_copied"]);
    expect(isMaterialCopied('{"tema":"compras"}', ["Meu coração é um tambor"])).toBe(false);
  });

  it("kit que falha na geração, esperado pronto, é kit_outcome_mismatch com resultado failed", async () => {
    const aiProvider = createFixtureAiProvider(pipelineFixture);
    aiProvider.respondWith("extract", () => ({ kind: "output", output: sentinelExtraction }));
    aiProvider.respondWith("plan", () => failureOf("ai_refused"));
    const request = await pipelineRequestOf({ otherTopicText: null });
    const outcome = await runRegressionCase(
      request,
      pipelineDependenciesOf(aiProvider, createCountingRenderer().pdfRenderer),
    );
    const check = checkRegressionCase(regressionCaseOf(), outcome, EMPTY_CASE_TEXT_REFERENCE);
    expect(check.actualKitOutcome).toBe("failed");
    expect(check.failedCheckList).toEqual(["kit_outcome_mismatch"]);
    expect(
      checkRegressionCase(
        regressionCaseOf({ expectedKitOutcome: "failed" }),
        outcome,
        EMPTY_CASE_TEXT_REFERENCE,
      ).failedCheckList,
    ).toEqual([]);
  });

  it("falha transitória da extração é analysis_error e preview_outcome_mismatch", async () => {
    const aiProvider = createFixtureAiProvider(pipelineFixture);
    aiProvider.respondWith("extract", () => failureOf("ai_unavailable"));
    const request = await pipelineRequestOf();
    const outcome = await runRegressionCase(
      request,
      pipelineDependenciesOf(aiProvider, createCountingRenderer().pdfRenderer),
    );
    const check = checkRegressionCase(regressionCaseOf(), outcome, EMPTY_CASE_TEXT_REFERENCE);
    expect(check.actualPreview).toEqual({ outcome: "analysis_error", failCode: "ai_unavailable" });
    expect(check.failedCheckList).toContain("preview_outcome_mismatch");
    expect(check.actualKitOutcome).toBe("not_applicable");
  });

  it("caso de fronteira aceita a recusa listada, e aí o kit esperado é not_applicable", async () => {
    const reference = regressionCaseOf();
    const borderCase = regressionCaseOf({
      photoList: reference.photoList.map((photo) => ({ ...photo, expectedLegibility: "partial" })),
      expectedPreview: {
        ...reference.expectedPreview,
        requiredTopicIdList: [],
        acceptableTopicIdList: [FRACTIONS_TOPIC_ID, PERIMETER_TOPIC_ID],
        acceptableFailCodeList: ["photos_unreadable"],
      },
      confirmation: {
        topicIdList: [FRACTIONS_TOPIC_ID, PERIMETER_TOPIC_ID],
        otherTopicText: null,
        perceivedDifficulty: null,
        noteText: null,
      },
    });
    const refused = checkRegressionCase(
      borderCase,
      (await fixtureRunOf(unreadableExtraction)).outcome,
      EMPTY_CASE_TEXT_REFERENCE,
    );
    expect(refused.failedCheckList).toEqual([]);
    expect(refused.expectedKitOutcome).toBe("not_applicable");
    const ready = checkRegressionCase(borderCase, await readyOutcome(), EMPTY_CASE_TEXT_REFERENCE);
    expect(ready.failedCheckList).toEqual([]);
    expect(ready.expectedKitOutcome).toBe("ready");
    const otherRefusal = checkRegressionCase(
      regressionCaseOf({
        ...borderCase,
        expectedPreview: {
          ...borderCase.expectedPreview,
          acceptableFailCodeList: ["no_topic_found"],
        },
      }),
      (await fixtureRunOf(unreadableExtraction)).outcome,
      EMPTY_CASE_TEXT_REFERENCE,
    );
    expect(otherRefusal.failedCheckList).toEqual([
      "preview_outcome_mismatch",
      "kit_outcome_mismatch",
    ]);
  });

  it("caso que quebra é crashed e kit_outcome_mismatch, mesmo esperando not_applicable", () => {
    const check = checkRegressionCase(
      regressionCaseOf({ expectedKitOutcome: "not_applicable" }),
      { kind: "crashed", stage: "generate", errorName: "TypeError" },
      EMPTY_CASE_TEXT_REFERENCE,
    );
    expect(check).toEqual({
      failedCheckList: ["kit_outcome_mismatch"],
      expectedKitOutcome: "not_applicable",
      warningList: [],
      actualPreview: null,
      actualKitOutcome: "crashed",
    });
  });
});

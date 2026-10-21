import { describe, expect, it } from "bun:test";
import { stageListOf } from "#src/__tests__/pipeline/__fixtures__/generation.ts";
import {
  aiProviderWithExtraction,
  createCountingRenderer,
  pipelineDependenciesOf,
  pipelineRequestOf,
} from "#src/__tests__/pipeline/__fixtures__/pipeline.ts";
import { regressionCaseOf } from "#src/__tests__/regression/__fixtures__/regression.ts";
import type { CaseConfirmation } from "#src/regression/regression-case.ts";
import { caseRequestOf, runRegressionCase } from "#src/regression/run-case.ts";

const confirmation: CaseConfirmation = {
  topicIdList: ["ma5-perimeter-area"],
  otherTopicText: "problemas com dinheiro e troco",
  perceivedDifficulty: "basic",
  noteText: "observação do caso",
};

describe("runner de casos (spec F1-10, RF-04)", () => {
  it("a confirmação do caso vira o pedido, com os opcionais", () => {
    const request = caseRequestOf(regressionCaseOf({ confirmation }), []);
    expect(request).toEqual({
      grade: "5",
      subject: "math",
      photoList: [],
      topicIdList: ["ma5-perimeter-area"],
      otherTopicText: "problemas com dinheiro e troco",
      perceivedDifficulty: "basic",
      noteText: "observação do caso",
    });
  });

  it("sem confirmação, entram os 3 primeiros obrigatórios, sem opcionais", () => {
    const regressionCase = regressionCaseOf();
    const request = caseRequestOf(
      regressionCaseOf({
        expectedPreview: {
          ...regressionCase.expectedPreview,
          requiredTopicIdList: [
            "ma5-fractions",
            "ma5-perimeter-area",
            "ma5-decimal-numbers",
            "ma5-percentage",
          ],
          acceptableTopicIdList: [],
        },
      }),
      [],
    );
    expect(request.topicIdList).toEqual([
      "ma5-fractions",
      "ma5-perimeter-area",
      "ma5-decimal-numbers",
    ]);
    expect([request.otherTopicText, request.perceivedDifficulty, request.noteText]).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("com not_applicable, a lista vai vazia e uma prévia que passa para na confirmação", async () => {
    const regressionCase = regressionCaseOf({
      expectedPreview: {
        ...regressionCaseOf().expectedPreview,
        outcome: "analysis_failed",
        failCode: "no_topic_found",
        requiredTopicIdList: [],
      },
      expectedKitOutcome: "not_applicable",
    });
    const fixtureRequest = await pipelineRequestOf();
    const request = caseRequestOf(regressionCase, fixtureRequest.photoList);
    expect(request.topicIdList).toEqual([]);
    const aiProvider = aiProviderWithExtraction();
    const outcome = await runRegressionCase(
      request,
      pipelineDependenciesOf(aiProvider, createCountingRenderer().pdfRenderer),
    );
    expect(outcome.kind === "ran" && outcome.run.outcome).toEqual({
      status: "failed",
      stage: "confirm",
      code: "topic_confirmation_required",
    });
    expect(stageListOf(aiProvider)).toEqual(["extract", "extract"]);
  });

  it("erro inesperado vira crashed com a etapa e o nome do erro", async () => {
    const request = await pipelineRequestOf();
    const outcome = await runRegressionCase(
      request,
      pipelineDependenciesOf(aiProviderWithExtraction(), createCountingRenderer().pdfRenderer, {
        createStageSignal: () => {
          throw new TypeError("sinal quebrado");
        },
      }),
    );
    expect(outcome).toEqual({ kind: "crashed", stage: "analyze", errorName: "TypeError" });
  });
});

import { expect, it } from "bun:test";
import * as core from "#src/index.ts";

it("o entrypoint exporta constantes, máquina de estados, schemas e payloads de job", () => {
  expect(core.KIT_PRICE_CENTS).toBe(2990);
  expect(typeof core.transitionOrder).toBe("function");
  expect(core.orderSchema.safeParse(null).success).toBe(false);
  expect(core.jobPayloadSchema.safeParse({ name: "charge.reconcile" }).success).toBe(true);
  expect(core.orderStatusList).toHaveLength(9);
  expect(core.TAXONOMY_VERSION).toBe("tax-v1");
  expect(core.listTopics("5", "math").length).toBeGreaterThan(0);
  expect(typeof core.renderTaxonomyMarkdown).toBe("function");
  expect(core.findUnsupportedTopicList("tirinha", "portuguese")).toHaveLength(1);
  expect(typeof core.mergePhotoExtractionList).toBe("function");
  expect(typeof core.decidePreviewOutcome).toBe("function");
  expect(typeof core.planKitSlots).toBe("function");
  expect(typeof core.validateKitPlan).toBe("function");
  expect(typeof core.composeStudyKit).toBe("function");
  expect(typeof core.applyKitRepair).toBe("function");
  expect(typeof core.listAnswerKey).toBe("function");
  expect(typeof core.formatExpectedAnswer).toBe("function");
  expect(typeof core.validateStudyKit).toBe("function");
  expect(typeof core.interpretReview).toBe("function");
  expect(typeof core.decideRepair).toBe("function");
  expect(core.studyKitSchema.safeParse(null).success).toBe(false);
  expect(core.kitContentSchemaBySubject.math.safeParse(null).success).toBe(false);
  expect(core.validationIssueDescriptionMap.figure_reference.length).toBeGreaterThan(0);
  expect(core.exerciseFormatLabelMap.word_problem).toBe("problemas do dia a dia");
});

it("errorNameOf devolve o nome do erro, nunca a mensagem", () => {
  expect(core.errorNameOf(new TypeError("dado do cliente"))).toBe("TypeError");
  expect(core.errorNameOf("texto solto")).toBe("string");
  expect(core.errorNameOf(null)).toBe("object");
});

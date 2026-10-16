import { describe, expect, it } from "bun:test";
import { KIT_ID, ORDER_ID } from "#src/__tests__/__fixtures__/entities.ts";
import { publishKitInputSchema } from "#src/kit/schemas.ts";
import { kitStorageKey } from "#src/storage/keys.ts";

const OTHER_KIT_ID = "66666666-6666-4666-8666-666666666666";

function buildPublishKitInput(overrides: Record<string, unknown> = {}) {
  return {
    orderId: ORDER_ID,
    kitId: KIT_ID,
    studyKit: { topicIdList: ["fractions"] },
    generationVersion: "gen-v1",
    taxonomyVersion: "tax-v1",
    activitiesStorageKey: kitStorageKey(ORDER_ID, KIT_ID, "activities"),
    answerKeyStorageKey: kitStorageKey(ORDER_ID, KIT_ID, "answer_key"),
    pageCountActivities: 6,
    pageCountAnswerKey: 8,
    ...overrides,
  };
}

describe("publishKitInputSchema (invariante 6: ready só com os dois PDFs)", () => {
  it("aceita kit com as duas keys do próprio kit", () => {
    expect(publishKitInputSchema.safeParse(buildPublishKitInput()).success).toBe(true);
  });

  it.each([
    ["activitiesStorageKey", undefined],
    ["answerKeyStorageKey", undefined],
    ["activitiesStorageKey", ""],
  ] as const)("rejeita %s ausente ou vazia", (field, value) => {
    expect(publishKitInputSchema.safeParse(buildPublishKitInput({ [field]: value })).success).toBe(
      false,
    );
  });

  it("rejeita key de outro kit ou trocada entre atividades e gabarito", () => {
    const result = publishKitInputSchema.safeParse(
      buildPublishKitInput({
        activitiesStorageKey: kitStorageKey(ORDER_ID, OTHER_KIT_ID, "activities"),
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toEqual([
      "activitiesStorageKey",
    ]);
    expect(
      publishKitInputSchema.safeParse(
        buildPublishKitInput({
          activitiesStorageKey: kitStorageKey(ORDER_ID, KIT_ID, "answer_key"),
          answerKeyStorageKey: kitStorageKey(ORDER_ID, KIT_ID, "activities"),
        }),
      ).success,
    ).toBe(false);
  });

  it("rejeita contagem de páginas não positiva, versão vazia e study_kit ausente", () => {
    for (const overrides of [
      { pageCountActivities: 0 },
      { pageCountAnswerKey: 1.5 },
      { generationVersion: "" },
      { taxonomyVersion: "" },
      { studyKit: undefined },
      { studyKit: null },
    ]) {
      expect(publishKitInputSchema.safeParse(buildPublishKitInput(overrides)).success).toBe(false);
    }
  });
});

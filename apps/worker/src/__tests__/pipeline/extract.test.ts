import { describe, expect, it } from "bun:test";
import {
  type AiFailureCode,
  type AiImage,
  type AiProvider,
  type AiRequest,
  EVIDENCE_DROPPED_TEXT,
  type ExtractionContext,
  invalidOutputAiFailureCodeList,
  MAX_PHOTO_COUNT,
  mergedExtractionSchema,
  photoDeleteDeadline,
  photoExtractionSchema,
} from "@gizito/core";
import {
  createScriptedProvider,
  failureOf,
  firstMathTopicId,
  otherGradeMathTopicId,
  outputOf,
  photoExtractionOf,
  secondMathTopicId,
  syntheticImage,
  topicCandidateOf,
  unreadableExtraction,
} from "#src/__tests__/pipeline/__fixtures__/extraction.ts";
import {
  analyzeMaterial,
  EXTRACTION_CACHE_FAILED_CODE,
  type ExtractionDependencies,
  type ExtractionPhoto,
} from "#src/pipeline/extract.ts";
import {
  createMemoryExtractionCache,
  type ExtractionCache,
} from "#src/pipeline/extraction-cache.ts";
import { buildExtractPrompt, EXTRACT_PROMPT_VERSION } from "#src/pipeline/prompts/extract/v1.ts";

const MILLISECONDS_PER_DAY = 86_400_000;
const baseNow = new Date("2026-10-20T12:00:00.000Z");
const mathContext: ExtractionContext = { grade: "5", subject: "math" };

function daysAfterBase(dayCount: number): Date {
  return new Date(baseNow.getTime() + dayCount * MILLISECONDS_PER_DAY);
}

function photoOf(image: AiImage, insertDatetime = baseNow): ExtractionPhoto {
  return { image, insertDatetime };
}

function dependenciesOf(
  aiProvider: AiProvider,
  override: Partial<ExtractionDependencies> = {},
): ExtractionDependencies {
  return {
    aiProvider,
    cache: createMemoryExtractionCache(),
    extractModel: "claude-haiku-5-5",
    now: () => baseNow,
    ...override,
  };
}

async function analyzeOk(
  photoList: readonly ExtractionPhoto[],
  dependencies: ExtractionDependencies,
  context = mathContext,
) {
  const result = await analyzeMaterial(photoList, context, dependencies);
  if (!result.ok) throw new Error(`análise falhou com ${result.error.code}`);
  return result.value;
}

const issueCodeListOf = (issueList: readonly { readonly code: string }[]) =>
  issueList.map((issue) => issue.code).sort();

describe("analyzeMaterial: chamada por foto (spec F1-06, RF-02)", () => {
  it("chama o modelo uma vez por foto, com a foto, o prompt extract v1 e o schema", async () => {
    const [firstImage, secondImage] = await Promise.all([syntheticImage(10), syntheticImage(200)]);
    const provider = createScriptedProvider([
      [firstImage, [outputOf(photoExtractionOf())]],
      [secondImage, [outputOf(photoExtractionOf())]],
    ]);
    const { signal } = new AbortController();
    await analyzeOk(
      [photoOf(firstImage), photoOf(secondImage)],
      dependenciesOf(provider, { signal }),
    );
    const prompt = buildExtractPrompt(mathContext);
    expect(provider.requestList.map(({ request }) => request.imageList?.[0])).toEqual(
      expect.arrayContaining([firstImage, secondImage]),
    );
    for (const { stage, request } of provider.requestList) {
      expect(stage).toBe("extract");
      expect(request.imageList).toHaveLength(1);
      expect(request.promptVersion).toBe(EXTRACT_PROMPT_VERSION);
      expect(request.outputSchema).toBe(photoExtractionSchema);
      expect(request.systemPrompt).toBe(prompt.systemPrompt);
      expect(request.userText).toBe(prompt.userText);
      expect(request.signal).toBe(signal);
    }
    expect(provider.requestList).toHaveLength(2);
  });

  it("chama o modelo para todas as fotos ao mesmo tempo", async () => {
    const imageList = await Promise.all([10, 100, 200].map(syntheticImage));
    const fakeProvider = createScriptedProvider(
      imageList.map((image) => [image, [outputOf(photoExtractionOf())]] as const),
    );
    let inFlightCount = 0;
    let maxInFlightCount = 0;
    const trackingProvider: AiProvider = {
      ...fakeProvider,
      extract: async <T>(request: AiRequest<T>) => {
        inFlightCount += 1;
        maxInFlightCount = Math.max(maxInFlightCount, inFlightCount);
        try {
          return await fakeProvider.extract(request);
        } finally {
          inFlightCount -= 1;
        }
      },
    };
    await analyzeOk(
      imageList.map((image) => photoOf(image)),
      dependenciesOf(trackingProvider),
    );
    expect(maxInFlightCount).toBe(imageList.length);
  });

  it("saída inválida faz uma nova chamada e a segunda vale", async () => {
    const image = await syntheticImage(10);
    const provider = createScriptedProvider([
      [image, [failureOf("ai_output_invalid"), outputOf(photoExtractionOf())]],
    ]);
    const analysis = await analyzeOk([photoOf(image)], dependenciesOf(provider));
    expect(analysis.photoStatusList).toEqual(["extracted"]);
    expect(analysis.aiCallList.map((call) => call.outcomeCode)).toEqual([
      "ai_output_invalid",
      "ok",
    ]);
    expect(analysis.previewOutcome.outcome).toBe("preview_ready");
  });

  it.each([...invalidOutputAiFailureCodeList])(
    "%s duas vezes deixa a foto fora da junção",
    async (code) => {
      const image = await syntheticImage(10);
      const provider = createScriptedProvider([[image, [failureOf(code), failureOf(code)]]]);
      const cache = createMemoryExtractionCache();
      const analysis = await analyzeOk([photoOf(image)], dependenciesOf(provider, { cache }));
      expect(analysis.photoStatusList).toEqual(["failed"]);
      expect(analysis.aiCallList.map((call) => call.outcomeCode)).toEqual([code, code]);
      expect(analysis.mergedExtraction.photoList[0]?.legibilityScore).toBeNull();
      expect(issueCodeListOf(analysis.mergedExtraction.issueList)).toEqual([
        "extraction_output_invalid",
      ]);
      expect(analysis.previewOutcome).toMatchObject({ failCode: "photos_unreadable" });
      expect(cache.entryMap.size).toBe(0);
    },
  );

  it("imagem que não abre não repete a chamada", async () => {
    const brokenImage: AiImage = { mediaType: "image/png", data: new Uint8Array([1, 2, 3]) };
    const provider = createScriptedProvider([]);
    const analysis = await analyzeOk([photoOf(brokenImage)], dependenciesOf(provider));
    expect(analysis.aiCallList.map((call) => call.outcomeCode)).toEqual(["ai_image_invalid"]);
    expect(analysis.photoStatusList).toEqual(["failed"]);
    expect(analysis.previewOutcome).toMatchObject({ failCode: "photos_unreadable" });
  });

  it("recusa lista vazia e mais fotos que o limite", async () => {
    const image = await syntheticImage(10);
    const provider = createScriptedProvider([]);
    const tooManyList = Array.from({ length: MAX_PHOTO_COUNT + 1 }, () => photoOf(image));
    await expect(analyzeMaterial([], mathContext, dependenciesOf(provider))).rejects.toThrow(
      RangeError,
    );
    await expect(
      analyzeMaterial(tooManyList, mathContext, dependenciesOf(provider)),
    ).rejects.toThrow(RangeError);
  });
});

describe("analyzeMaterial: falha da etapa (spec F1-06, RF-03)", () => {
  it("erro transitório volta à fila e a reexecução só chama a foto que faltou", async () => {
    const [readyImage, pendingImage] = await Promise.all([syntheticImage(10), syntheticImage(200)]);
    const cache = createMemoryExtractionCache();
    const photoList = [photoOf(readyImage), photoOf(pendingImage)];
    const firstProvider = createScriptedProvider([
      [readyImage, [outputOf(photoExtractionOf())]],
      [pendingImage, [failureOf("ai_rate_limited")]],
    ]);
    const failed = await analyzeMaterial(
      photoList,
      mathContext,
      dependenciesOf(firstProvider, { cache }),
    );
    expect(failed.ok ? null : failed.error).toMatchObject({
      code: "ai_rate_limited",
      isRetryable: true,
    });
    const failedCallList = failed.ok ? [] : failed.error.aiCallList;
    expect(failedCallList.map((call) => call.outcomeCode).sort()).toEqual([
      "ai_rate_limited",
      "ok",
    ]);
    expect(failedCallList.find((call) => call.outcomeCode === "ai_rate_limited")).toMatchObject({
      inputTokenCount: 0,
      outputTokenCount: 0,
      costCents: 0,
    });
    expect(cache.entryMap.size).toBe(1);

    const retryProvider = createScriptedProvider([[pendingImage, [outputOf(photoExtractionOf())]]]);
    const retried = await analyzeOk(photoList, dependenciesOf(retryProvider, { cache }));
    expect(retryProvider.requestList).toHaveLength(1);
    expect(retried.photoStatusList).toEqual(["cached", "extracted"]);
  });

  it.each<AiFailureCode>(["ai_auth_failed", "ai_request_invalid"])(
    "%s falha a etapa sem voltar à fila",
    async (code) => {
      const image = await syntheticImage(10);
      const provider = createScriptedProvider([[image, [failureOf(code)]]]);
      const result = await analyzeMaterial([photoOf(image)], mathContext, dependenciesOf(provider));
      expect(result.ok ? null : result.error).toMatchObject({ code, isRetryable: false });
      expect(provider.requestList).toHaveLength(1);
    },
  );
});

describe("analyzeMaterial: falha do cache (spec F1-06, RF-03)", () => {
  const cacheFailure = new Error("conexão perdida");

  it("falha ao guardar volta à fila com o custo da chamada já feita", async () => {
    const image = await syntheticImage(10);
    const cache: ExtractionCache = {
      find: async () => null,
      save: () => Promise.reject(cacheFailure),
    };
    const provider = createScriptedProvider([[image, [outputOf(photoExtractionOf())]]]);
    const result = await analyzeMaterial(
      [photoOf(image)],
      mathContext,
      dependenciesOf(provider, { cache }),
    );
    expect(result.ok ? null : result.error).toMatchObject({
      code: EXTRACTION_CACHE_FAILED_CODE,
      isRetryable: true,
      cause: cacheFailure,
    });
    expect(result.ok ? [] : result.error.aiCallList.map((call) => call.outcomeCode)).toEqual([
      "ok",
    ]);
  });

  it("falha ao consultar volta à fila sem chamar o modelo", async () => {
    const image = await syntheticImage(10);
    const cache: ExtractionCache = {
      find: () => Promise.reject(cacheFailure),
      save: async () => {},
    };
    const provider = createScriptedProvider([]);
    const result = await analyzeMaterial(
      [photoOf(image)],
      mathContext,
      dependenciesOf(provider, { cache }),
    );
    expect(result.ok ? null : result.error).toMatchObject({
      code: EXTRACTION_CACHE_FAILED_CODE,
      isRetryable: true,
      aiCallList: [],
    });
    expect(provider.requestList).toHaveLength(0);
  });
});

describe("analyzeMaterial: cache por hash (spec F1-06, RF-04)", () => {
  it("a mesma foto de novo sai do cache, sem chamada e com o mesmo resultado", async () => {
    const image = await syntheticImage(10);
    const cache = createMemoryExtractionCache();
    const extraction = photoExtractionOf({
      topicCandidateList: [
        topicCandidateOf(firstMathTopicId, { evidence: "ligue (11) 98765-4321 para tirar dúvida" }),
      ],
    });
    const first = await analyzeOk(
      [photoOf(image)],
      dependenciesOf(createScriptedProvider([[image, [outputOf(extraction)]]]), { cache }),
    );
    const secondProvider = createScriptedProvider([]);
    const second = await analyzeOk([photoOf(image)], dependenciesOf(secondProvider, { cache }));
    expect(secondProvider.requestList).toHaveLength(0);
    expect(second.photoStatusList).toEqual(["cached"]);
    expect(second.aiCallList).toEqual([]);
    expect(second.mergedExtraction).toEqual(first.mergedExtraction);
  });

  it("ano, disciplina, modelo e bytes diferentes pedem nova chamada", async () => {
    const [image, otherImage] = await Promise.all([syntheticImage(10), syntheticImage(200)]);
    const cache = createMemoryExtractionCache();
    const runList: readonly (readonly [AiImage, ExtractionContext, string])[] = [
      [image, mathContext, "claude-haiku-5-5"],
      [image, { grade: "6", subject: "math" }, "claude-haiku-5-5"],
      [image, { grade: "5", subject: "portuguese" }, "claude-haiku-5-5"],
      [image, mathContext, "claude-sonnet-5-5"],
      [otherImage, mathContext, "claude-haiku-5-5"],
    ];
    for (const [runImage, context, extractModel] of runList) {
      const provider = createScriptedProvider([[runImage, [outputOf(photoExtractionOf())]]]);
      await analyzeOk(
        [photoOf(runImage)],
        dependenciesOf(provider, { cache, extractModel }),
        context,
      );
      expect(provider.requestList).toHaveLength(1);
    }
    expect(cache.entryMap.size).toBe(runList.length);
  });

  it("entrada vencida é ignorada e o acerto não estende a validade", async () => {
    const image = await syntheticImage(10);
    const cache = createMemoryExtractionCache();
    await analyzeOk(
      [photoOf(image)],
      dependenciesOf(createScriptedProvider([[image, [outputOf(photoExtractionOf())]]]), { cache }),
    );
    const laterPhoto = photoOf(image, daysAfterBase(10));
    const hitProvider = createScriptedProvider([]);
    await analyzeOk(
      [laterPhoto],
      dependenciesOf(hitProvider, { cache, now: () => daysAfterBase(10) }),
    );
    expect(hitProvider.requestList).toHaveLength(0);
    expect([...cache.entryMap.values()][0]?.expireDatetime).toEqual(photoDeleteDeadline(baseNow));

    const expiredProvider = createScriptedProvider([[image, [outputOf(photoExtractionOf())]]]);
    const expired = await analyzeOk(
      [laterPhoto],
      dependenciesOf(expiredProvider, { cache, now: () => photoDeleteDeadline(baseNow) }),
    );
    expect(expiredProvider.requestList).toHaveLength(1);
    expect(expired.photoStatusList).toEqual(["extracted"]);
    expect([...cache.entryMap.values()][0]?.expireDatetime).toEqual(
      photoDeleteDeadline(daysAfterBase(10)),
    );
  });

  it("sanitiza antes do cache: telefone, e-mail e assunto de outro ano não chegam lá", async () => {
    const image = await syntheticImage(10);
    const cache = createMemoryExtractionCache();
    const extraction = photoExtractionOf({
      topicCandidateList: [
        topicCandidateOf(firstMathTopicId, { evidence: "ligue (11) 98765-4321 para tirar dúvida" }),
        topicCandidateOf(otherGradeMathTopicId),
      ],
      materialProfile: {
        ...photoExtractionOf().materialProfile,
        terminologyList: ["fração", "contato@escola.com.br"],
      },
    });
    const analysis = await analyzeOk(
      [photoOf(image)],
      dependenciesOf(createScriptedProvider([[image, [outputOf(extraction)]]]), { cache }),
    );
    const [entry] = [...cache.entryMap.values()];
    expect(entry?.extraction.topicCandidateList).toEqual([
      topicCandidateOf(firstMathTopicId, { evidence: EVIDENCE_DROPPED_TEXT }),
    ]);
    expect(entry?.extraction.materialProfile.terminologyList).toEqual(["fração"]);
    expect(JSON.stringify(entry)).not.toMatch(/98765|@escola/);
    const expectedCodeList = [
      "extraction_personal_data_dropped",
      "extraction_personal_data_dropped",
      "extraction_unknown_topic",
    ];
    expect(issueCodeListOf(entry?.issueList ?? [])).toEqual(expectedCodeList);
    expect(issueCodeListOf(analysis.mergedExtraction.issueList)).toEqual(expectedCodeList);
  });
});

describe("analyzeMaterial: resultado (spec F1-06, RF-05)", () => {
  it("junta as fotos, dá a legibilidade de cada uma e decide preview_ready", async () => {
    const imageList = await Promise.all([10, 70, 130, 190].map(syntheticImage));
    const [goodImage, partialImage, unreadableImage, invalidImage] = imageList;
    if (!goodImage || !partialImage || !unreadableImage || !invalidImage) {
      throw new Error("fotos sintéticas faltando");
    }
    const provider = createScriptedProvider([
      [goodImage, [outputOf(photoExtractionOf())]],
      [
        partialImage,
        [
          outputOf(
            photoExtractionOf({
              legibility: "partial",
              topicCandidateList: [
                topicCandidateOf(secondMathTopicId),
                topicCandidateOf(firstMathTopicId, { confidence: "medium" }),
              ],
            }),
          ),
        ],
      ],
      [unreadableImage, [outputOf(unreadableExtraction)]],
      [invalidImage, [failureOf("ai_output_invalid"), failureOf("ai_output_invalid")]],
    ]);
    const analysis = await analyzeOk(
      imageList.map((image) => photoOf(image)),
      dependenciesOf(provider),
    );
    const { mergedExtraction } = analysis;
    expect(mergedExtractionSchema.safeParse(mergedExtraction).success).toBe(true);
    expect(mergedExtraction.photoList.map((photo) => photo.legibilityScore)).toEqual([
      1,
      0.5,
      0,
      null,
    ]);
    expect(mergedExtraction.topicCandidateList).toEqual([
      { topicId: firstMathTopicId, confidence: "high", photoIndexList: [1, 2] },
      { topicId: secondMathTopicId, confidence: "high", photoIndexList: [2] },
    ]);
    expect(analysis.photoStatusList).toEqual(["extracted", "extracted", "extracted", "failed"]);
    expect(analysis.previewOutcome).toEqual({
      outcome: "preview_ready",
      event: "analysis_succeeded",
    });
  });

  it("só assunto ainda não atendido dá only_unsupported_topics", async () => {
    const image = await syntheticImage(10);
    const extraction = photoExtractionOf({
      topicCandidateList: [],
      unsupportedTopicIdList: ["ma-grid-symmetry"],
    });
    const analysis = await analyzeOk(
      [photoOf(image)],
      dependenciesOf(createScriptedProvider([[image, [outputOf(extraction)]]])),
    );
    expect(analysis.mergedExtraction.unsupportedTopicList).toEqual([
      { unsupportedTopicId: "ma-grid-symmetry", photoIndexList: [1] },
    ]);
    expect(analysis.previewOutcome).toMatchObject({ failCode: "only_unsupported_topics" });
  });

  it.each([
    [["subject_mismatch"], true],
    [["grade_mismatch"], true],
    [[], false],
  ] as const)(
    "sem assunto e com avisos %p dá no_topic_found (mismatch %p)",
    async (warningList, isMaterialMismatch) => {
      const image = await syntheticImage(10);
      const extraction = photoExtractionOf({
        topicCandidateList: [],
        sourceWarningCodeList: [...warningList],
      });
      const analysis = await analyzeOk(
        [photoOf(image)],
        dependenciesOf(createScriptedProvider([[image, [outputOf(extraction)]]])),
      );
      expect(analysis.previewOutcome).toEqual({
        outcome: "analysis_failed",
        event: "analysis_failed",
        failCode: "no_topic_found",
        isMaterialMismatch,
      });
    },
  );

  it("dado pessoal visível vira aviso com a foto em que apareceu", async () => {
    const [firstImage, secondImage] = await Promise.all([syntheticImage(10), syntheticImage(200)]);
    const provider = createScriptedProvider([
      [firstImage, [outputOf(photoExtractionOf())]],
      [
        secondImage,
        [outputOf(photoExtractionOf({ sourceWarningCodeList: ["personal_data_visible"] }))],
      ],
    ]);
    const analysis = await analyzeOk(
      [photoOf(firstImage), photoOf(secondImage)],
      dependenciesOf(provider),
    );
    expect(analysis.mergedExtraction.sourceWarningList).toEqual([
      { code: "personal_data_visible", photoIndexList: [2] },
    ]);
  });
});

describe("analyzeMaterial: custo por chamada (spec F1-06, RF-06)", () => {
  it("registra cada chamada, com a reparada, e nenhuma para o acerto de cache", async () => {
    const imageList = await Promise.all([10, 100, 200].map(syntheticImage));
    const [firstImage, secondImage, thirdImage] = imageList;
    if (!firstImage || !secondImage || !thirdImage) throw new Error("fotos sintéticas faltando");
    const cache = createMemoryExtractionCache();
    const provider = createScriptedProvider([
      [firstImage, [outputOf(photoExtractionOf())]],
      [secondImage, [failureOf("ai_output_invalid"), outputOf(photoExtractionOf())]],
      [thirdImage, [outputOf(photoExtractionOf())]],
    ]);
    const analysis = await analyzeOk(
      imageList.map((image) => photoOf(image)),
      dependenciesOf(provider, { cache }),
    );
    expect(analysis.aiCallList).toHaveLength(4);
    for (const call of analysis.aiCallList) {
      expect(call).toMatchObject({
        stage: "extract",
        model: "claude-haiku-5-5",
        promptVersion: EXTRACT_PROMPT_VERSION,
      });
      expect(call.inputTokenCount).toBeGreaterThan(0);
      expect(call.costCents).toBeGreaterThan(0);
    }
    const cached = await analyzeOk(
      imageList.map((image) => photoOf(image)),
      dependenciesOf(createScriptedProvider([]), { cache }),
    );
    expect(cached.aiCallList).toEqual([]);
  });
});

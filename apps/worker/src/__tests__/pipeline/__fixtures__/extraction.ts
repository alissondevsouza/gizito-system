import {
  type AiFailureCode,
  type AiImage,
  listTopics,
  type MaterialProfile,
  type PhotoExtraction,
  type TopicCandidate,
} from "@gizito/core";
import {
  createFakeAiProvider,
  type FakeAiProvider,
  type FakeAiResponse,
} from "@gizito/integrations/fakes";
import sharp from "sharp";

const SYNTHETIC_IMAGE_SIDE_PX = 8;

export async function syntheticImage(red: number): Promise<AiImage> {
  const buffer = await sharp({
    create: {
      width: SYNTHETIC_IMAGE_SIDE_PX,
      height: SYNTHETIC_IMAGE_SIDE_PX,
      channels: 3,
      background: { r: red, g: 120, b: 60 },
    },
  })
    .png()
    .toBuffer();
  return { mediaType: "image/png", data: new Uint8Array(buffer) };
}

function topicIdAt(grade: "5" | "7", position: number): string {
  const topic = listTopics(grade, "math")[position];
  if (topic === undefined) throw new Error(`taxonomia sem assunto ${position} no ${grade}º ano`);
  return topic.topicId;
}

export const firstMathTopicId = topicIdAt("5", 0);
export const secondMathTopicId = topicIdAt("5", 1);
export const otherGradeMathTopicId = topicIdAt("7", 0);

export function topicCandidateOf(
  topicId: string,
  override: Partial<TopicCandidate> = {},
): TopicCandidate {
  return {
    topicId,
    confidence: "high",
    evidence: "título da página e seis contas do assunto",
    ...override,
  };
}

const baseMaterialProfile: MaterialProfile = {
  exerciseFormatList: ["computation"],
  notationList: ["fraction_slash"],
  terminologyList: ["fração equivalente"],
  contextThemeList: ["compras no mercado"],
  apparentLevel: "at_grade",
  hasFigures: false,
  isHandwritten: false,
};

export function photoExtractionOf(override: Partial<PhotoExtraction> = {}): PhotoExtraction {
  return {
    legibility: "good",
    isSchoolMaterial: true,
    photoIssueList: [],
    topicCandidateList: [topicCandidateOf(firstMathTopicId)],
    unsupportedTopicIdList: [],
    materialProfile: baseMaterialProfile,
    sourceWarningCodeList: [],
    ...override,
  };
}

export const unreadableExtraction = photoExtractionOf({
  legibility: "unreadable",
  photoIssueList: ["blurry"],
  topicCandidateList: [],
  materialProfile: {
    ...baseMaterialProfile,
    exerciseFormatList: [],
    notationList: [],
    terminologyList: [],
    contextThemeList: [],
  },
});

export function outputOf(extraction: PhotoExtraction): FakeAiResponse {
  return { kind: "output", output: extraction };
}

export function failureOf(code: AiFailureCode): FakeAiResponse {
  return { kind: "failure", code };
}

export function createScriptedProvider(
  script: readonly (readonly [AiImage, readonly FakeAiResponse[]])[],
): FakeAiProvider {
  const queueByImage = new Map(script.map(([image, responseList]) => [image, [...responseList]]));
  const provider = createFakeAiProvider();
  provider.respondWith("extract", (request) => {
    const image = request.imageList?.[0];
    const next = image === undefined ? undefined : queueByImage.get(image)?.shift();
    if (next === undefined) throw new Error("foto sem resposta no roteiro do teste");
    return next;
  });
  return provider;
}

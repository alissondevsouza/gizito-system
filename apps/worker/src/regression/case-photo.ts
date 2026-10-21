import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { err, ok, type Result } from "@gizito/core";
import sharp from "sharp";
import { z } from "zod";
import { photoMediaTypeOf } from "#src/cli/pipeline-input.ts";
import { computeContentHash, type ExtractionPhoto } from "#src/pipeline/extract.ts";
import {
  CASE_PHOTO_DIRECTORY_NAME,
  type LoadedRegressionCase,
} from "#src/regression/regression-case.ts";

const photoFileNameSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*\.(?:png|jpe?g)$/);
const variationTextSchema = z.string().trim().min(3).max(60);

export const photoVariationSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("blur"),
    caseId: z.string(),
    fileName: photoFileNameSchema,
    sourceFileName: photoFileNameSchema,
    sigma: z.number().min(0.3).max(100),
  }),
  z.strictObject({
    kind: z.literal("personal_data"),
    caseId: z.string(),
    fileName: photoFileNameSchema,
    sourceFileName: photoFileNameSchema,
    studentName: variationTextSchema,
    schoolName: variationTextSchema,
    phone: z.string().regex(/^\(\d{2}\) \d{4,5}-\d{4}$/),
    leftPercent: z.number().min(0).max(95),
    topPercent: z.number().min(0).max(95),
  }),
]);
export type PhotoVariation = z.infer<typeof photoVariationSchema>;
export type PersonalDataVariation = Extract<PhotoVariation, { kind: "personal_data" }>;

export const photoVariationFileSchema = z.strictObject({
  variationList: z.array(photoVariationSchema),
});

export type PersonalDataLabel = {
  readonly lineList: readonly string[];
  readonly leftPercent: number;
  readonly topPercent: number;
};

export type PersonalDataPainter = {
  readonly paint: (image: Uint8Array, label: PersonalDataLabel) => Promise<Uint8Array>;
  readonly close: () => Promise<void>;
};

export type PhotoPreparationDependencies = {
  readonly sourceDirectory: string;
  readonly variationList: readonly PhotoVariation[];
  readonly createPainter: () => PersonalDataPainter;
};

export type PhotoPreparation = {
  readonly presentCount: number;
  readonly writtenCount: number;
};

export function personalDataLabelOf(variation: PersonalDataVariation): PersonalDataLabel {
  return {
    lineList: [
      `Nome: ${variation.studentName}`,
      `Escola: ${variation.schoolName}`,
      `Tel.: ${variation.phone}`,
    ],
    leftPercent: variation.leftPercent,
    topPercent: variation.topPercent,
  };
}

export function personalDataTextListOf(
  variationList: readonly PhotoVariation[],
  caseId: string,
): readonly string[] {
  return variationList.flatMap((variation) =>
    variation.caseId === caseId && variation.kind === "personal_data"
      ? [variation.studentName, variation.schoolName, variation.phone]
      : [],
  );
}

export async function loadPhotoVariationList(
  path: string,
): Promise<Result<readonly PhotoVariation[], readonly string[]>> {
  const file = Bun.file(path);
  if (!(await file.exists())) return err([`${path} ausente`]);
  const parsed = photoVariationFileSchema.safeParse(await file.json().catch(() => null));
  if (!parsed.success) {
    return err(
      parsed.error.issues.map((issue) => `${path}: ${issue.path.join(".")} ${issue.message}`),
    );
  }
  return ok(parsed.data.variationList);
}

export function casePhotoPathOf(caseDirectory: string, fileName: string): string {
  return join(caseDirectory, CASE_PHOTO_DIRECTORY_NAME, fileName);
}

async function readBytes(path: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const file = Bun.file(path);
  return (await file.exists()) ? new Uint8Array(await file.arrayBuffer()) : null;
}

type PhotoProducer = {
  readonly produce: (
    variation: PhotoVariation | undefined,
    sourceBytes: Uint8Array,
  ) => Promise<Uint8Array>;
  readonly close: () => Promise<void>;
};

function createPhotoProducer(createPainter: () => PersonalDataPainter): PhotoProducer {
  let painter: PersonalDataPainter | null = null;
  return {
    async produce(variation, sourceBytes) {
      if (variation === undefined) return sourceBytes;
      if (variation.kind === "blur") {
        return new Uint8Array(await sharp(sourceBytes).blur(variation.sigma).png().toBuffer());
      }
      painter ??= createPainter();
      return painter.paint(sourceBytes, personalDataLabelOf(variation));
    },
    async close() {
      await painter?.close();
    },
  };
}

export async function prepareCasePhotoList(
  loadedCaseList: readonly LoadedRegressionCase[],
  dependencies: PhotoPreparationDependencies,
): Promise<Result<PhotoPreparation, readonly string[]>> {
  const producer = createPhotoProducer(dependencies.createPainter);
  const errorList: string[] = [];
  let presentCount = 0;
  let writtenCount = 0;
  try {
    for (const { regressionCase, caseDirectory } of loadedCaseList) {
      for (const photo of regressionCase.photoList) {
        const label = `${regressionCase.caseId}/${photo.fileName}`;
        const targetPath = casePhotoPathOf(caseDirectory, photo.fileName);
        const present = await readBytes(targetPath);
        if (present !== null && computeContentHash(present) === photo.sha256) {
          presentCount += 1;
          continue;
        }
        const variation = dependencies.variationList.find(
          (candidate) =>
            candidate.caseId === regressionCase.caseId && candidate.fileName === photo.fileName,
        );
        const sourceFileName = variation?.sourceFileName ?? photo.fileName;
        const sourceBytes = await readBytes(join(dependencies.sourceDirectory, sourceFileName));
        if (sourceBytes === null) {
          errorList.push(
            `${label}: origem ${sourceFileName} ausente em ${dependencies.sourceDirectory}`,
          );
          continue;
        }
        const producedBytes = await producer.produce(variation, sourceBytes);
        await mkdir(join(caseDirectory, CASE_PHOTO_DIRECTORY_NAME), { recursive: true });
        await Bun.write(targetPath, producedBytes);
        writtenCount += 1;
        const producedHash = computeContentHash(producedBytes);
        if (producedHash !== photo.sha256) {
          errorList.push(
            `${label}: a foto gerada tem SHA-256 ${producedHash}, e o case.json espera ${photo.sha256}; confira a imagem e atualize o case.json`,
          );
        }
      }
    }
  } finally {
    await producer.close();
  }
  return errorList.length > 0 ? err(errorList) : ok({ presentCount, writtenCount });
}

export async function loadCasePhotoList(
  loadedCase: LoadedRegressionCase,
  insertDatetime: Date,
): Promise<Result<readonly ExtractionPhoto[], readonly string[]>> {
  const { regressionCase, caseDirectory } = loadedCase;
  const errorList: string[] = [];
  const photoList: ExtractionPhoto[] = [];
  for (const photo of regressionCase.photoList) {
    const label = `${regressionCase.caseId}/${photo.fileName}`;
    const mediaType = photoMediaTypeOf(photo.fileName);
    const data = await readBytes(casePhotoPathOf(caseDirectory, photo.fileName));
    if (mediaType === null) {
      errorList.push(`${label}: extensão de foto não aceita`);
    } else if (data === null) {
      errorList.push(`${label}: foto ausente; rode bun run test:pedagogy --prepare-photos`);
    } else if (computeContentHash(data) !== photo.sha256) {
      errorList.push(`${label}: foto diferente da registrada no case.json`);
    } else {
      photoList.push({ image: { mediaType, data }, insertDatetime });
    }
  }
  return errorList.length > 0 ? err(errorList) : ok(photoList);
}

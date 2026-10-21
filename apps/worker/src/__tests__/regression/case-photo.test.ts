import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { regressionCaseOf } from "#src/__tests__/regression/__fixtures__/regression.ts";
import { computeContentHash } from "#src/pipeline/extract.ts";
import {
  loadCasePhotoList,
  type PersonalDataLabel,
  type PersonalDataPainter,
  type PhotoVariation,
  personalDataTextListOf,
  prepareCasePhotoList,
} from "#src/regression/case-photo.ts";
import type { LoadedRegressionCase } from "#src/regression/regression-case.ts";

const temporaryDirectoryList: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectoryList.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "gizito-photos-"));
  temporaryDirectoryList.push(directory);
  return directory;
}

async function sourceImage(): Promise<Uint8Array> {
  const buffer = await sharp({
    create: { width: 64, height: 48, channels: 3, background: { r: 240, g: 240, b: 230 } },
  })
    .composite([
      {
        input: {
          create: { width: 20, height: 4, channels: 3, background: { r: 20, g: 30, b: 90 } },
        },
        left: 10,
        top: 20,
      },
    ])
    .png()
    .toBuffer();
  return new Uint8Array(buffer);
}

function createRecordingPainter() {
  const labelList: PersonalDataLabel[] = [];
  let closeCount = 0;
  const painter: PersonalDataPainter = {
    async paint(image, label) {
      labelList.push(label);
      return new Uint8Array(await sharp(image).negate().png().toBuffer());
    },
    async close() {
      closeCount += 1;
    },
  };
  return { painter, labelList, closeCountOf: () => closeCount };
}

const blurVariation: Extract<PhotoVariation, { kind: "blur" }> = {
  kind: "blur",
  caseId: "5-math-desfocada",
  fileName: "fonte-desfocada.png",
  sourceFileName: "fonte.png",
  sigma: 3,
};

const personalDataVariation: PhotoVariation = {
  kind: "personal_data",
  caseId: "5-math-dado-pessoal",
  fileName: "fonte-dado-pessoal.png",
  sourceFileName: "fonte.png",
  studentName: "Nome Inventado Teste",
  schoolName: "Escola Inventada Teste",
  phone: "(11) 91234-5678",
  leftPercent: 10,
  topPercent: 80,
};

async function setupOf(variationHashOverride: Partial<Record<string, string>> = {}) {
  const sourceDirectory = await temporaryDirectory();
  const casesDirectory = await temporaryDirectory();
  const source = await sourceImage();
  await Bun.write(join(sourceDirectory, "fonte.png"), source);
  const sourceHash = computeContentHash(source);
  const blurredHash = computeContentHash(
    new Uint8Array(await sharp(source).blur(blurVariation.sigma).png().toBuffer()),
  );
  const paintedHash = computeContentHash(
    new Uint8Array(await sharp(source).negate().png().toBuffer()),
  );
  const loadedOf = (caseId: string, fileName: string, sha256: string): LoadedRegressionCase => ({
    regressionCase: regressionCaseOf({
      caseId,
      photoList: [{ fileName, sha256, expectedLegibility: "good" }],
    }),
    caseDirectory: join(casesDirectory, caseId),
  });
  const caseList = [
    loadedOf("5-math-copia", "fonte.png", sourceHash),
    loadedOf(
      blurVariation.caseId,
      blurVariation.fileName,
      variationHashOverride.blur ?? blurredHash,
    ),
    loadedOf(
      personalDataVariation.caseId,
      personalDataVariation.fileName,
      variationHashOverride.personal_data ?? paintedHash,
    ),
  ];
  return { sourceDirectory, caseList, source };
}

describe("preparação das fotos dos casos (spec F1-10, RF-03)", () => {
  it("copia a imagem, gera as variações e na segunda vez não refaz nada", async () => {
    const { sourceDirectory, caseList, source } = await setupOf();
    const recording = createRecordingPainter();
    const dependencies = {
      sourceDirectory,
      variationList: [blurVariation, personalDataVariation],
      createPainter: () => recording.painter,
    };
    const first = await prepareCasePhotoList(caseList, dependencies);
    expect(first).toEqual({ ok: true, value: { presentCount: 0, writtenCount: 3 } });
    expect(recording.labelList).toEqual([
      {
        lineList: [
          "Nome: Nome Inventado Teste",
          "Escola: Escola Inventada Teste",
          "Tel.: (11) 91234-5678",
        ],
        leftPercent: 10,
        topPercent: 80,
      },
    ]);
    expect(recording.closeCountOf()).toBe(1);
    const copied = await Bun.file(
      join(caseList[0]?.caseDirectory ?? "", "photos", "fonte.png"),
    ).bytes();
    expect(computeContentHash(copied)).toBe(computeContentHash(source));
    const second = await prepareCasePhotoList(caseList, dependencies);
    expect(second).toEqual({ ok: true, value: { presentCount: 3, writtenCount: 0 } });
    expect(recording.labelList).toHaveLength(1);
  });

  it("variação que não reproduz o hash do case.json aborta com o hash gerado", async () => {
    const { sourceDirectory, caseList } = await setupOf({ blur: "b".repeat(64) });
    const prepared = await prepareCasePhotoList(caseList, {
      sourceDirectory,
      variationList: [blurVariation, personalDataVariation],
      createPainter: () => createRecordingPainter().painter,
    });
    expect(prepared.ok).toBe(false);
    if (prepared.ok) return;
    expect(prepared.error).toHaveLength(1);
    expect(prepared.error[0]).toStartWith(
      "5-math-desfocada/fonte-desfocada.png: a foto gerada tem SHA-256 ",
    );
    expect(prepared.error[0]).toContain(`o case.json espera ${"b".repeat(64)}`);
  });

  it("imagem de origem ausente vira erro do caso, sem abrir o Chromium", async () => {
    const { caseList } = await setupOf();
    let painterCreated = false;
    const prepared = await prepareCasePhotoList(caseList, {
      sourceDirectory: await temporaryDirectory(),
      variationList: [blurVariation, personalDataVariation],
      createPainter: () => {
        painterCreated = true;
        return createRecordingPainter().painter;
      },
    });
    expect(prepared.ok).toBe(false);
    expect(prepared.ok ? [] : prepared.error).toHaveLength(3);
    expect(painterCreated).toBe(false);
  });

  it("a carga das fotos recusa foto ausente e foto diferente da registrada", async () => {
    const { sourceDirectory, caseList } = await setupOf();
    const [copyCase] = caseList;
    if (copyCase === undefined) throw new Error("caso de cópia ausente");
    const missing = await loadCasePhotoList(copyCase, new Date());
    expect(missing).toEqual({
      ok: false,
      error: ["5-math-copia/fonte.png: foto ausente; rode bun run test:pedagogy --prepare-photos"],
    });
    await prepareCasePhotoList([copyCase], {
      sourceDirectory,
      variationList: [],
      createPainter: () => createRecordingPainter().painter,
    });
    const loaded = await loadCasePhotoList(copyCase, new Date());
    expect(loaded.ok && loaded.value[0]?.image.mediaType).toBe("image/png");
    await mkdir(join(copyCase.caseDirectory, "photos"), { recursive: true });
    await Bun.write(join(copyCase.caseDirectory, "photos", "fonte.png"), "outra foto");
    const changed = await loadCasePhotoList(copyCase, new Date());
    expect(changed).toEqual({
      ok: false,
      error: ["5-math-copia/fonte.png: foto diferente da registrada no case.json"],
    });
  });

  it("os textos procurados de um caso vêm só da variação dele: nome, cada palavra do nome, escola e telefone", () => {
    const variationList = [blurVariation, personalDataVariation];
    expect(personalDataTextListOf(variationList, "5-math-dado-pessoal")).toEqual([
      "Nome Inventado Teste",
      "Nome",
      "Inventado",
      "Teste",
      "Escola Inventada Teste",
      "(11) 91234-5678",
      "12345678",
    ]);
    expect(personalDataTextListOf(variationList, "5-math-desfocada")).toEqual([]);
  });
});

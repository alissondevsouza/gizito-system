import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { computeContentHash } from "@gizito/integrations";
import { loadPhotoVariationList } from "#src/regression/case-photo.ts";
import {
  type CaseTag,
  type LoadedRegressionCase,
  loadRegressionCaseList,
} from "#src/regression/regression-case.ts";

const repositoryRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
const casesDirectory = `${repositoryRoot}tests/pedagogy/cases`;
const variationPath = `${repositoryRoot}tests/pedagogy/photo-variations.json`;
const sourceDirectory = `${repositoryRoot}docs/materiais-fotograficos`;

async function loadAll() {
  const [loaded, variationList, sourceFileNameList] = await Promise.all([
    loadRegressionCaseList(casesDirectory),
    loadPhotoVariationList(variationPath),
    readdir(sourceDirectory),
  ]);
  if (!loaded.ok) throw new Error(loaded.error.join("\n"));
  if (!variationList.ok) throw new Error(variationList.error.join("\n"));
  return { caseList: loaded.value, variationList: variationList.value, sourceFileNameList };
}

function countWithTag(caseList: readonly LoadedRegressionCase[], tag: CaseTag): number {
  return caseList.filter(({ regressionCase }) => regressionCase.tagList.includes(tag)).length;
}

describe("os 35 casos da v1 (spec F1-10, RF-02; spec pedagógica §13.1)", () => {
  it("todos os case.json carregam sem problema", async () => {
    const { caseList } = await loadAll();
    expect(caseList).toHaveLength(35);
  });

  it("cada uma das 30 imagens é um caso, com o hash da imagem do repositório", async () => {
    const { caseList, variationList, sourceFileNameList } = await loadAll();
    const variationCaseIdList = variationList.map((variation) => variation.caseId);
    const baseCaseList = caseList.filter(
      ({ regressionCase }) => !variationCaseIdList.includes(regressionCase.caseId),
    );
    const usedFileNameList = baseCaseList.flatMap(({ regressionCase }) =>
      regressionCase.photoList.map((photo) => photo.fileName),
    );
    expect(sourceFileNameList.filter((fileName) => fileName.endsWith(".png"))).toHaveLength(30);
    expect([...usedFileNameList].sort()).toEqual(
      sourceFileNameList.filter((fileName) => fileName.endsWith(".png")).sort(),
    );
    for (const { regressionCase } of baseCaseList) {
      for (const photo of regressionCase.photoList) {
        const bytes = await Bun.file(`${sourceDirectory}/${photo.fileName}`).bytes();
        expect(`${regressionCase.caseId} ${computeContentHash(bytes)}`).toBe(
          `${regressionCase.caseId} ${photo.sha256}`,
        );
      }
    }
  });

  it("as 5 variações apontam para um caso e uma foto existentes, com origem entre as imagens", async () => {
    const { caseList, variationList, sourceFileNameList } = await loadAll();
    expect(variationList.map((variation) => variation.kind).sort()).toEqual([
      "blur",
      "personal_data",
      "personal_data",
      "personal_data",
      "personal_data",
    ]);
    for (const variation of variationList) {
      const loaded = caseList.find(
        ({ regressionCase }) => regressionCase.caseId === variation.caseId,
      );
      expect(loaded?.regressionCase.photoList.map((photo) => photo.fileName)).toContain(
        variation.fileName,
      );
      expect(sourceFileNameList).toContain(variation.sourceFileName);
    }
  });

  it("a contagem por tag segue a classificação da F1-10", async () => {
    const { caseList, variationList } = await loadAll();
    const variationCaseIdList = variationList.map((variation) => variation.caseId);
    const baseCaseList = caseList.filter(
      ({ regressionCase }) => !variationCaseIdList.includes(regressionCase.caseId),
    );
    expect(countWithTag(baseCaseList, "handwritten")).toBe(30);
    expect(countWithTag(baseCaseList, "fractions")).toBe(5);
    expect(countWithTag(baseCaseList, "ambiguous_statement")).toBe(2);
    expect(countWithTag(baseCaseList, "only_unsupported")).toBe(1);
    expect(countWithTag(baseCaseList, "unsupported_topic")).toBe(2);
    expect(countWithTag(baseCaseList, "grade_mismatch")).toBe(3);
    expect(countWithTag(baseCaseList, "bad_photo")).toBe(12);
    expect(countWithTag(caseList, "other_topic")).toBe(2);
    expect(countWithTag(caseList, "personal_data")).toBe(4);
    const unreadableList = caseList.filter(({ regressionCase }) =>
      regressionCase.photoList.some((photo) => photo.expectedLegibility === "unreadable"),
    );
    expect(unreadableList.map(({ regressionCase }) => regressionCase.caseId)).toEqual([
      "4-portuguese-pontuacao-desfocada",
    ]);
  });

  it("caso com dado pessoal exige personal_data_visible, e caso com outro confirma um texto", async () => {
    const { caseList } = await loadAll();
    for (const { regressionCase } of caseList) {
      const requiresWarning =
        regressionCase.expectedPreview.requiredSourceWarningCodeList.includes(
          "personal_data_visible",
        );
      expect(`${regressionCase.caseId} ${requiresWarning}`).toBe(
        `${regressionCase.caseId} ${regressionCase.tagList.includes("personal_data")}`,
      );
      const hasOther = (regressionCase.confirmation?.otherTopicText ?? null) !== null;
      expect(`${regressionCase.caseId} ${hasOther}`).toBe(
        `${regressionCase.caseId} ${regressionCase.tagList.includes("other_topic")}`,
      );
    }
  });
});

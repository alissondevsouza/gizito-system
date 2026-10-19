import { describe, expect, it } from "bun:test";
import { canonicalSha256 } from "#src/__tests__/__fixtures__/canonical-json.ts";
import { publishedTaxonomyList } from "#src/__tests__/__fixtures__/taxonomy-history.ts";
import { TAXONOMY_VERSION, taxonomyTopicList } from "#src/pedagogy/taxonomy/index.ts";
import { unsupportedTopicList } from "#src/pedagogy/taxonomy/unsupported.ts";

const currentTaxonomy = publishedTaxonomyList.find(
  (published) => published.taxonomyVersion === TAXONOMY_VERSION,
);

describe("versão da taxonomia (RF-07)", () => {
  it("TAXONOMY_VERSION é a última versão publicada", () => {
    expect(publishedTaxonomyList.at(-1)?.taxonomyVersion).toBe(TAXONOMY_VERSION);
  });

  it("o conteúdo não muda sem um novo TAXONOMY_VERSION", () => {
    const current = publishedTaxonomyList.find(
      (published) => published.taxonomyVersion === TAXONOMY_VERSION,
    );
    expect(canonicalSha256(taxonomyTopicList)).toBe(current?.fingerprint ?? "");
  });

  it("a versão atual registra exatamente os ids atuais, e cada versão tem conteúdo próprio", () => {
    const current = publishedTaxonomyList.find(
      (published) => published.taxonomyVersion === TAXONOMY_VERSION,
    );
    expect(current?.topicIdList).toEqual(taxonomyTopicList.map((topic) => topic.topicId));
    const versionList = publishedTaxonomyList.map((published) => published.taxonomyVersion);
    const contentFingerprintList = publishedTaxonomyList.map(
      (published) => `${published.fingerprint}:${published.unsupportedFingerprint}`,
    );
    expect(new Set(versionList).size).toBe(versionList.length);
    expect(new Set(contentFingerprintList).size).toBe(contentFingerprintList.length);
  });

  it("a lista de assuntos ainda não atendidos não muda sem um novo TAXONOMY_VERSION", () => {
    expect(canonicalSha256(unsupportedTopicList)).toBe(
      currentTaxonomy?.unsupportedFingerprint ?? "",
    );
    expect(currentTaxonomy?.unsupportedTopicIdList).toEqual(
      unsupportedTopicList.map((topic) => topic.unsupportedTopicId),
    );
  });

  it("nenhum id de não atendido de versão publicada some", () => {
    const currentIdSet = new Set(unsupportedTopicList.map((topic) => topic.unsupportedTopicId));
    const missingIdList = publishedTaxonomyList
      .flatMap((published) => published.unsupportedTopicIdList)
      .filter((unsupportedTopicId) => !currentIdSet.has(unsupportedTopicId));
    expect(missingIdList).toEqual([]);
  });

  it("nenhum id de versão publicada some; descontinuar é deprecated: true", () => {
    const currentIdSet = new Set(taxonomyTopicList.map((topic) => topic.topicId));
    const missingIdList = publishedTaxonomyList
      .flatMap((published) => published.topicIdList)
      .filter((topicId) => !currentIdSet.has(topicId));
    expect(missingIdList).toEqual([]);
  });

  it("o fingerprint não depende da ordem das chaves", () => {
    expect(canonicalSha256({ a: 1, b: [{ c: 2, d: 3 }] })).toBe(
      canonicalSha256({ b: [{ d: 3, c: 2 }], a: 1 }),
    );
  });
});

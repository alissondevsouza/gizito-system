import { describe, expect, it } from "bun:test";
import { canonicalSha256 } from "#src/__tests__/__fixtures__/canonical-json.ts";
import { publishedTaxonomyList } from "#src/__tests__/__fixtures__/taxonomy-history.ts";
import { TAXONOMY_VERSION, taxonomyTopicList } from "#src/pedagogy/taxonomy/index.ts";

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

  it("a versão atual registra exatamente os ids atuais, e cada versão tem fingerprint próprio", () => {
    const current = publishedTaxonomyList.find(
      (published) => published.taxonomyVersion === TAXONOMY_VERSION,
    );
    expect(current?.topicIdList).toEqual(taxonomyTopicList.map((topic) => topic.topicId));
    const versionList = publishedTaxonomyList.map((published) => published.taxonomyVersion);
    const fingerprintList = publishedTaxonomyList.map((published) => published.fingerprint);
    expect(new Set(versionList).size).toBe(versionList.length);
    expect(new Set(fingerprintList).size).toBe(fingerprintList.length);
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

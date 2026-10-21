import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { regressionCaseOf } from "#src/__tests__/regression/__fixtures__/regression.ts";
import {
  findCaseProblemList,
  loadRegressionCaseList,
  type RegressionCase,
  regressionCaseSchema,
} from "#src/regression/regression-case.ts";

const temporaryDirectoryList: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectoryList.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function casesDirectoryWith(
  entryList: readonly { readonly directoryName: string; readonly content: string | null }[],
): Promise<string> {
  const casesDirectory = await mkdtemp(join(tmpdir(), "gizito-cases-"));
  temporaryDirectoryList.push(casesDirectory);
  for (const { directoryName, content } of entryList) {
    await mkdir(join(casesDirectory, directoryName), { recursive: true });
    if (content !== null)
      await Bun.write(join(casesDirectory, directoryName, "case.json"), content);
  }
  return casesDirectory;
}

function withPreview(override: Partial<RegressionCase["expectedPreview"]>): RegressionCase {
  const regressionCase = regressionCaseOf();
  return regressionCaseOf({
    expectedPreview: { ...regressionCase.expectedPreview, ...override },
  });
}

describe("formato do caso (spec F1-10, RF-01)", () => {
  it("o caso de referência é válido no schema e sem problema semântico", () => {
    const regressionCase = regressionCaseOf();
    expect(regressionCaseSchema.safeParse(regressionCase).success).toBe(true);
    expect(findCaseProblemList(regressionCase)).toEqual([]);
  });

  it("recusa campo desconhecido, tag fora da lista, foto sem hash e lista de fotos vazia", () => {
    const invalidList: unknown[] = [
      { ...regressionCaseOf(), extra: true },
      regressionCaseOf({ tagList: ["sem_tag" as never] }),
      regressionCaseOf({
        photoList: [{ fileName: "foto.png", sha256: "curto", expectedLegibility: "good" }],
      }),
      regressionCaseOf({ photoList: [] }),
      regressionCaseOf({ tagList: ["handwritten", "handwritten"] }),
      regressionCaseOf({ caseId: "5-matematica-teste" }),
    ];
    for (const invalid of invalidList) {
      expect(regressionCaseSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("caseId com ano ou disciplina diferente do caso é problema", () => {
    expect(findCaseProblemList(regressionCaseOf({ caseId: "6-math-teste" }))).toEqual([
      "caseId não começa com 5-math-",
    ]);
  });

  it("failCode só vem com a prévia analysis_failed, e not_applicable só com ela", () => {
    expect(findCaseProblemList(withPreview({ failCode: "no_topic_found" }))).toContain(
      "failCode deve ser nulo só com a prévia preview_ready",
    );
    expect(
      findCaseProblemList(regressionCaseOf({ expectedKitOutcome: "not_applicable" })),
    ).toContain("expectedKitOutcome é not_applicable só com a prévia analysis_failed");
    const refused = regressionCaseOf({
      expectedPreview: {
        ...withPreview({}).expectedPreview,
        outcome: "analysis_failed",
        failCode: "photos_unreadable",
        requiredTopicIdList: [],
        acceptableTopicIdList: [],
      },
      expectedKitOutcome: "not_applicable",
    });
    expect(findCaseProblemList(refused)).toEqual([]);
  });

  it("assunto de outro ano, repetido entre obrigatório e aceitável, ou confirmado fora do ano é problema", () => {
    expect(findCaseProblemList(withPreview({ requiredTopicIdList: ["ma7-integers"] }))).toEqual([
      "ma7-integers não é assunto do 5º ano em math",
    ]);
    expect(
      findCaseProblemList(withPreview({ acceptableTopicIdList: ["ma5-fractions"] })),
    ).toContain("ma5-fractions é obrigatório e aceitável ao mesmo tempo");
    const confirmed = regressionCaseOf({
      confirmation: {
        topicIdList: ["lp5-pronouns"],
        otherTopicText: null,
        perceivedDifficulty: null,
        noteText: null,
      },
    });
    expect(findCaseProblemList(confirmed)).toEqual([
      "lp5-pronouns não é assunto do 5º ano em math",
    ]);
  });

  it("área não atendida de outra disciplina é problema", () => {
    expect(
      findCaseProblemList(withPreview({ unsupportedTopicIdList: ["lp-essay-writing"] })),
    ).toEqual(["lp-essay-writing não é área não atendida de math"]);
  });

  it("prévia preview_ready sem confirmação e sem obrigatório é problema", () => {
    expect(findCaseProblemList(withPreview({ requiredTopicIdList: [] }))).toEqual([
      "prévia preview_ready sem confirmação pede ao menos um assunto obrigatório",
    ]);
  });

  it("prévia analysis_failed com confirmação é problema", () => {
    const reference = regressionCaseOf();
    const refusedWithConfirmation = regressionCaseOf({
      expectedPreview: {
        ...reference.expectedPreview,
        outcome: "analysis_failed",
        failCode: "no_topic_found",
        requiredTopicIdList: [],
        acceptableTopicIdList: [],
      },
      expectedKitOutcome: "not_applicable",
      confirmation: {
        topicIdList: ["ma5-fractions"],
        otherTopicText: null,
        perceivedDifficulty: null,
        noteText: null,
      },
    });
    expect(findCaseProblemList(refusedWithConfirmation)).toEqual([
      "prévia analysis_failed não tem confirmação",
    ]);
  });

  it("a confirmação segue as regras do pedido: total de assuntos e outro não atendido", () => {
    const tooMany = regressionCaseOf({
      confirmation: {
        topicIdList: ["ma5-fractions", "ma5-perimeter-area", "ma5-decimal-numbers"],
        otherTopicText: "problemas com dinheiro",
        perceivedDifficulty: null,
        noteText: null,
      },
    });
    expect(findCaseProblemList(tooMany)).toEqual([
      "a confirmação soma 4 assuntos; o pedido aceita de 1 a 3",
    ]);
    const unsupportedOther = regressionCaseOf({
      confirmation: {
        topicIdList: ["ma5-fractions"],
        otherTopicText: "fluxograma",
        perceivedDifficulty: null,
        noteText: null,
      },
    });
    expect(findCaseProblemList(unsupportedOther)).toEqual([
      "o outro da confirmação cai em área não atendida",
    ]);
  });

  it("a carga junta os erros de todos os diretórios e confere caseId com o nome", async () => {
    const valid = regressionCaseOf();
    const casesDirectory = await casesDirectoryWith([
      { directoryName: "5-math-teste", content: JSON.stringify(valid) },
      { directoryName: "5-math-outro-nome", content: JSON.stringify(valid) },
      { directoryName: "5-math-sem-arquivo", content: null },
      { directoryName: "5-math-quebrado", content: "{ não é json" },
    ]);
    const loaded = await loadRegressionCaseList(casesDirectory);
    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.error).toContain("5-math-outro-nome: caseId diferente do nome do diretório");
    expect(loaded.error).toContain("5-math-sem-arquivo: case.json ausente");
    expect(loaded.error.some((error) => error.startsWith("5-math-quebrado: "))).toBe(true);
  });

  it("a carga devolve os casos em ordem de diretório", async () => {
    const casesDirectory = await casesDirectoryWith([
      { directoryName: "5-math-teste", content: JSON.stringify(regressionCaseOf()) },
      {
        directoryName: "5-math-anterior",
        content: JSON.stringify(regressionCaseOf({ caseId: "5-math-anterior" })),
      },
    ]);
    const loaded = await loadRegressionCaseList(casesDirectory);
    expect(loaded.ok && loaded.value.map(({ regressionCase }) => regressionCase.caseId)).toEqual([
      "5-math-anterior",
      "5-math-teste",
    ]);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_NOTE_LENGTH, MAX_OTHER_TOPIC_LENGTH, MAX_PHOTO_BYTES } from "@gizito/core";
import { loadPipelinePhotoList, parsePipelineArgs } from "#src/cli/pipeline-input.ts";

const requiredArgList = ["--grade", "5", "--subject", "math"];

function errorListOf(argv: readonly string[]): readonly string[] {
  const parsed = parsePipelineArgs(argv);
  if (parsed.ok) throw new Error("argumentos aceitos sem erro");
  return parsed.error;
}

function argsOf(argv: readonly string[]) {
  const parsed = parsePipelineArgs(argv);
  if (!parsed.ok) throw new Error(parsed.error.join("\n"));
  return parsed.value;
}

describe("parsePipelineArgs aceita o comando (spec F1-09, RF-01)", () => {
  it("fotos depois de --photos e só os obrigatórios", () => {
    expect(argsOf(["--photos", "a.png", "b.JPG", ...requiredArgList])).toEqual({
      photoPathList: ["a.png", "b.JPG"],
      grade: "5",
      subject: "math",
      topicIdList: null,
      otherTopicText: null,
      perceivedDifficulty: null,
      noteText: null,
      outputDirectory: null,
    });
  });

  it("--photos repetido soma as fotos na ordem", () => {
    expect(
      argsOf(["--photos", "a.png", "--photos", "b.jpeg", "c.png", ...requiredArgList])
        .photoPathList,
    ).toEqual(["a.png", "b.jpeg", "c.png"]);
  });

  it("cada opcional chega aparado", () => {
    expect(
      argsOf([
        "--photos",
        "a.png",
        ...requiredArgList,
        "--topics",
        " ma5-fractions , ma5-perimeter-area ",
        "--other",
        "  dinheiro e troco ",
        "--difficulty",
        "basic",
        "--note",
        "  Ele troca numerador  ",
        "--out",
        "saida/kit",
      ]),
    ).toEqual({
      photoPathList: ["a.png"],
      grade: "5",
      subject: "math",
      topicIdList: ["ma5-fractions", "ma5-perimeter-area"],
      otherTopicText: "dinheiro e troco",
      perceivedDifficulty: "basic",
      noteText: "Ele troca numerador",
      outputDirectory: "saida/kit",
    });
  });

  it("observação só com espaços vira nula", () => {
    expect(argsOf(["--photos", "a.png", ...requiredArgList, "--note", "   "]).noteText).toBeNull();
  });
});

describe("parsePipelineArgs recusa antes de qualquer chamada (spec F1-09, RF-02)", () => {
  it.each<[string, readonly string[], string]>([
    ["sem foto", requiredArgList, "--photos pede de 1 a 5 fotos, recebeu 0"],
    [
      "mais de cinco fotos",
      ["--photos", "1.png", "2.png", "3.png", "4.png", "5.png", "6.png", ...requiredArgList],
      "recebeu 6",
    ],
    ["extensão fora da lista", ["--photos", "a.gif", ...requiredArgList], "foto fora de"],
    ["ano fora do enum", ["--photos", "a.png", "--grade", "8", "--subject", "math"], "--grade"],
    ["sem disciplina", ["--photos", "a.png", "--grade", "5"], "--subject aceita"],
    ["opção desconhecida", ["--photos", "a.png", ...requiredArgList, "--ano"], "--ano"],
    ["opção sem valor", ["--photos", "a.png", "--subject", "math", "--grade"], "--grade precisa"],
    [
      "valor engolido pela próxima opção",
      ["--photos", "a.png", "--grade", "--subject", "math"],
      "--grade precisa",
    ],
    [
      "opção repetida",
      ["--photos", "a.png", ...requiredArgList, "--grade", "6"],
      "--grade aparece mais de uma vez",
    ],
    [
      "assunto de outro ano",
      ["--photos", "a.png", ...requiredArgList, "--topics", "ma7-integers"],
      "topic_not_selectable: ma7-integers",
    ],
    [
      "o outro escrito em --topics",
      ["--photos", "a.png", ...requiredArgList, "--topics", "other"],
      "topic_not_selectable: other",
    ],
    [
      "assunto repetido",
      ["--photos", "a.png", ...requiredArgList, "--topics", "ma5-fractions,ma5-fractions"],
      "--topics repete assunto",
    ],
    [
      "quatro assuntos com o outro",
      [
        "--photos",
        "a.png",
        ...requiredArgList,
        "--topics",
        "ma5-fractions,ma5-perimeter-area,ma5-decimal-numbers",
        "--other",
        "dinheiro e troco",
      ],
      "somam 4 assuntos",
    ],
    ["--topics vazio", ["--photos", "a.png", ...requiredArgList, "--topics", ","], "somam 0"],
    [
      "outro longo demais",
      ["--photos", "a.png", ...requiredArgList, "--other", "x".repeat(MAX_OTHER_TOPIC_LENGTH + 1)],
      "--other aceita",
    ],
    [
      "outro em assunto não atendido",
      ["--photos", "a.png", ...requiredArgList, "--other", "fluxogramas do dia"],
      "other_topic_unsupported: o --other cai em assunto ainda não atendido (Algoritmos e fluxogramas)",
    ],
    [
      "dificuldade fora do enum",
      ["--photos", "a.png", ...requiredArgList, "--difficulty", "hard"],
      "--difficulty aceita",
    ],
    [
      "observação longa demais",
      ["--photos", "a.png", ...requiredArgList, "--note", "x".repeat(MAX_NOTE_LENGTH + 1)],
      "--note aceita",
    ],
  ])("%s", (_name, argv, expectedText) => {
    expect(errorListOf(argv).some((error) => error.includes(expectedText))).toBe(true);
  });
});

describe("loadPipelinePhotoList lê e confere as fotos (spec F1-09, RF-02)", () => {
  let directory = "";
  const insertDatetime = new Date("2026-10-21T12:00:00Z");

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "gizito-pipeline-"));
    await Bun.write(join(directory, "caderno.png"), new Uint8Array([1, 2, 3]));
    await Bun.write(join(directory, "caderno.JPEG"), new Uint8Array([4, 5]));
    await Bun.write(join(directory, "vazia.png"), new Uint8Array());
    await Bun.write(join(directory, "grande.jpg"), new Uint8Array(MAX_PHOTO_BYTES + 1));
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("devolve as fotos com o tipo pela extensão e a data dada", async () => {
    const loaded = await loadPipelinePhotoList(
      [join(directory, "caderno.png"), join(directory, "caderno.JPEG")],
      insertDatetime,
    );
    if (!loaded.ok) throw new Error(loaded.error.join("\n"));
    expect(
      loaded.value.map((photo) => [
        photo.image.mediaType,
        [...photo.image.data],
        photo.insertDatetime,
      ]),
    ).toEqual([
      ["image/png", [1, 2, 3], insertDatetime],
      ["image/jpeg", [4, 5], insertDatetime],
    ]);
  });

  it("lista cada foto ausente, vazia ou grande demais", async () => {
    const loaded = await loadPipelinePhotoList(
      [
        join(directory, "ausente.png"),
        join(directory, "vazia.png"),
        join(directory, "grande.jpg"),
        join(directory, "caderno.png"),
      ],
      insertDatetime,
    );
    if (loaded.ok) throw new Error("fotos aceitas sem erro");
    expect(loaded.error).toEqual([
      `foto não encontrada: ${join(directory, "ausente.png")}`,
      `foto vazia ou acima de 8 MB: ${join(directory, "vazia.png")}`,
      `foto vazia ou acima de 8 MB: ${join(directory, "grande.jpg")}`,
    ]);
  });
});

import { expect, it } from "bun:test";
import { difficultyList, perceivedDifficultyList, questionBlockList } from "#src/enums.ts";
import { exerciseFormatList, notationList } from "#src/pedagogy/extraction/schemas.ts";
import {
  difficultyLabelMap,
  exerciseFormatLabelMap,
  handwrittenLabel,
  notationLabelMap,
  perceivedDifficultyLabelMap,
  questionBlockLabelMap,
} from "#src/pedagogy/labels.ts";

it("rótulos pt-BR cobrem todos os valores dos enums", () => {
  const pairList: readonly [readonly string[], Readonly<Record<string, string>>][] = [
    [exerciseFormatList, exerciseFormatLabelMap],
    [notationList, notationLabelMap],
    [difficultyList, difficultyLabelMap],
    [perceivedDifficultyList, perceivedDifficultyLabelMap],
    [questionBlockList, questionBlockLabelMap],
  ];
  for (const [valueList, labelMap] of pairList) {
    expect(Object.keys(labelMap).sort()).toEqual([...valueList].sort());
    for (const value of valueList) expect(labelMap[value]?.trim().length).toBeGreaterThan(0);
  }
});

it("rótulos do bloco “O que entendi” e dos placeholders seguem o design doc e os prompts", () => {
  expect(exerciseFormatLabelMap.word_problem).toBe("problemas do dia a dia");
  expect(notationLabelMap.fraction_slash).toBe("frações escritas como a/b");
  expect(handwrittenLabel).toBe("texto manuscrito");
  expect(difficultyLabelMap).toEqual({
    easy: "fácil",
    medium: "intermediária",
    hard: "desafiadora",
  });
  expect(perceivedDifficultyLabelMap).toEqual({
    basic: "básica",
    intermediate: "intermediária",
    unknown: "não informada",
  });
  expect(questionBlockLabelMap).toEqual({ practice: "fixação", mock: "simulado" });
});

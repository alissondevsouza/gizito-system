import type { Difficulty, PerceivedDifficulty, QuestionBlock, QuestionType } from "#src/enums.ts";
import type { ExerciseFormat, Notation } from "#src/pedagogy/extraction/schemas.ts";

export const exerciseFormatLabelMap: Readonly<Record<ExerciseFormat, string>> = {
  multiple_choice: "questões de múltipla escolha",
  fill_in_blank: "exercícios de completar",
  computation: "contas para resolver",
  word_problem: "problemas do dia a dia",
  true_false: "questões de verdadeiro ou falso",
  matching: "exercícios de ligar ou relacionar",
  open_answer: "perguntas de resposta escrita",
  text_comprehension: "leitura e interpretação de texto",
  table_or_chart: "tabelas e gráficos",
};

export const notationLabelMap: Readonly<Record<Notation, string>> = {
  fraction_slash: "frações escritas como a/b",
  fraction_stacked: "frações escritas uma sobre a outra",
  mixed_number: "números mistos",
  decimal_comma: "números decimais com vírgula",
  multiplication_x: "multiplicação com o sinal ×",
  multiplication_dot: "multiplicação com ponto",
  division_obelus: "divisão com o sinal ÷",
  division_bracket: "divisão pelo método da chave",
  percent_sign: "porcentagem com o sinal %",
  power_superscript: "potências com expoente",
};

export const handwrittenLabel = "texto manuscrito";

export const difficultyLabelMap: Readonly<Record<Difficulty, string>> = {
  easy: "fácil",
  medium: "intermediária",
  hard: "desafiadora",
};

export const perceivedDifficultyLabelMap: Readonly<Record<PerceivedDifficulty, string>> = {
  basic: "básica",
  intermediate: "intermediária",
  unknown: "não informada",
};

export const questionBlockLabelMap: Readonly<Record<QuestionBlock, string>> = {
  practice: "fixação",
  mock: "simulado",
};

export const questionTypeLabelMap: Readonly<Record<QuestionType, string>> = {
  multiple_choice: "múltipla escolha",
  open_answer: "resposta aberta",
};

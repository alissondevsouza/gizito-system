import { z } from "zod";
import { MAX_ISSUE_EXCERPT_LENGTH, MAX_REVIEW_NOTE_LENGTH } from "#src/constants.ts";
import {
  type KitItemId,
  kitItemIdSchema,
  type TopicRef,
  topicRefSchema,
} from "#src/pedagogy/kit-item.ts";

export const validationSeverityList = ["blocker", "warning"] as const;
export const validationSeveritySchema = z.enum(validationSeverityList);
export type ValidationSeverity = z.infer<typeof validationSeveritySchema>;

export const validationStageList = ["extract", "plan", "validate", "review", "render"] as const;
export const validationStageSchema = z.enum(validationStageList);
export type ValidationStage = z.infer<typeof validationStageSchema>;

export const validationRepairList = ["item", "kit", "plan", "none"] as const;
export const validationRepairSchema = z.enum(validationRepairList);
export type ValidationRepair = z.infer<typeof validationRepairSchema>;

export const itemReviewCodeList = [
  "answer_incorrect",
  "answer_ambiguous",
  "explanation_inconsistent",
  "missing_data",
  "off_topic",
  "above_grade",
  "inappropriate_content",
  "personal_data",
  "evidence_unsupported",
  "example_incorrect",
  "weak_distractor",
  "difficulty_mismatch",
  "hint_in_mock",
  "variety_as_error",
  "fraction_not_simplified",
  "unclear_wording",
] as const;
export const itemReviewCodeSchema = z.enum(itemReviewCodeList);
export type ItemReviewCode = z.infer<typeof itemReviewCodeSchema>;

export const kitReviewCodeList = [
  "section_incorrect",
  "base_text_inappropriate",
  "off_topic",
  "above_grade",
  "inappropriate_content",
  "personal_data",
  "style_mismatch",
] as const;
export const kitReviewCodeSchema = z.enum(kitReviewCodeList);
export type KitReviewCode = z.infer<typeof kitReviewCodeSchema>;

export const validationIssueCodeList = [
  "extraction_unknown_topic",
  "extraction_unknown_unsupported_topic",
  "extraction_personal_data_dropped",
  "extraction_output_invalid",
  "plan_output_invalid",
  "plan_slot_mismatch",
  "plan_multiple_choice_mix",
  "plan_contextualized_minority",
  "plan_base_text_invalid",
  "other_topic_unfeasible",
  "kit_output_invalid",
  "kit_slot_mismatch",
  "topic_coverage_below_minimum",
  "difficulty_distribution_mismatch",
  "option_duplicate",
  "correct_option_mismatch",
  "distractor_equivalent",
  "math_recalculation_mismatch",
  "math_expression_invalid",
  "example_recalculation_mismatch",
  "evidence_quote_not_found",
  "non_computable_excess",
  "expression_number_not_in_statement",
  "fraction_not_simplified",
  "unit_missing",
  "figure_reference",
  "personal_data_pattern",
  "external_link",
  "blocked_term",
  "duplicate_question",
  "math_markup_invalid",
  "markup_forbidden",
  "similar_question",
  "example_similar_to_question",
  "mock_hint",
  "statement_too_long",
  "base_text_length",
  "review_answer_mismatch",
  "review_answer_incorrect",
  "review_answer_ambiguous",
  "review_explanation_inconsistent",
  "review_missing_data",
  "review_off_topic",
  "review_above_grade",
  "review_inappropriate_content",
  "review_personal_data",
  "review_evidence_unsupported",
  "review_example_incorrect",
  "review_weak_distractor",
  "review_difficulty_mismatch",
  "review_hint_in_mock",
  "review_variety_as_error",
  "review_fraction_not_simplified",
  "review_unclear_wording",
  "review_kit_section_incorrect",
  "review_kit_base_text_inappropriate",
  "review_kit_off_topic",
  "review_kit_above_grade",
  "review_kit_inappropriate_content",
  "review_kit_personal_data",
  "review_kit_style_mismatch",
  "render_failed",
  "render_item_missing",
  "render_overflow",
  "page_count_out_of_range",
] as const;
export const validationIssueCodeSchema = z.enum(validationIssueCodeList);
export type ValidationIssueCode = z.infer<typeof validationIssueCodeSchema>;

export type ValidationIssueRule = {
  readonly stage: ValidationStage;
  readonly severity: ValidationSeverity;
  readonly repair: ValidationRepair | null;
};

const extractWarning: ValidationIssueRule = { stage: "extract", severity: "warning", repair: null };
const planBlocker: ValidationIssueRule = { stage: "plan", severity: "blocker", repair: "plan" };
const validateItemBlocker: ValidationIssueRule = {
  stage: "validate",
  severity: "blocker",
  repair: "item",
};
const validateKitBlocker: ValidationIssueRule = {
  stage: "validate",
  severity: "blocker",
  repair: "kit",
};
const validateDefenseBlocker: ValidationIssueRule = {
  stage: "validate",
  severity: "blocker",
  repair: "none",
};
const validateWarning: ValidationIssueRule = {
  stage: "validate",
  severity: "warning",
  repair: null,
};
const reviewItemBlocker: ValidationIssueRule = {
  stage: "review",
  severity: "blocker",
  repair: "item",
};
const reviewKitBlocker: ValidationIssueRule = {
  stage: "review",
  severity: "blocker",
  repair: "kit",
};
const reviewWarning: ValidationIssueRule = { stage: "review", severity: "warning", repair: null };
const renderBlocker: ValidationIssueRule = { stage: "render", severity: "blocker", repair: null };

export const validationIssueRuleMap: Readonly<Record<ValidationIssueCode, ValidationIssueRule>> = {
  extraction_unknown_topic: extractWarning,
  extraction_unknown_unsupported_topic: extractWarning,
  extraction_personal_data_dropped: extractWarning,
  extraction_output_invalid: extractWarning,
  plan_output_invalid: planBlocker,
  plan_slot_mismatch: planBlocker,
  plan_multiple_choice_mix: planBlocker,
  plan_contextualized_minority: planBlocker,
  plan_base_text_invalid: planBlocker,
  other_topic_unfeasible: { stage: "plan", severity: "blocker", repair: "none" },
  kit_output_invalid: validateKitBlocker,
  kit_slot_mismatch: validateKitBlocker,
  topic_coverage_below_minimum: validateDefenseBlocker,
  difficulty_distribution_mismatch: validateDefenseBlocker,
  option_duplicate: validateItemBlocker,
  correct_option_mismatch: validateItemBlocker,
  distractor_equivalent: validateItemBlocker,
  math_recalculation_mismatch: validateItemBlocker,
  math_expression_invalid: validateItemBlocker,
  example_recalculation_mismatch: validateItemBlocker,
  evidence_quote_not_found: validateItemBlocker,
  non_computable_excess: validateWarning,
  expression_number_not_in_statement: validateWarning,
  fraction_not_simplified: validateWarning,
  unit_missing: validateWarning,
  figure_reference: validateItemBlocker,
  personal_data_pattern: validateItemBlocker,
  external_link: validateItemBlocker,
  blocked_term: validateItemBlocker,
  duplicate_question: validateItemBlocker,
  math_markup_invalid: validateItemBlocker,
  markup_forbidden: validateItemBlocker,
  similar_question: validateWarning,
  example_similar_to_question: validateWarning,
  mock_hint: validateWarning,
  statement_too_long: validateWarning,
  base_text_length: validateWarning,
  review_answer_mismatch: reviewItemBlocker,
  review_answer_incorrect: reviewItemBlocker,
  review_answer_ambiguous: reviewItemBlocker,
  review_explanation_inconsistent: reviewItemBlocker,
  review_missing_data: reviewItemBlocker,
  review_off_topic: reviewItemBlocker,
  review_above_grade: reviewItemBlocker,
  review_inappropriate_content: reviewItemBlocker,
  review_personal_data: reviewItemBlocker,
  review_evidence_unsupported: reviewItemBlocker,
  review_example_incorrect: reviewItemBlocker,
  review_weak_distractor: reviewWarning,
  review_difficulty_mismatch: reviewWarning,
  review_hint_in_mock: reviewWarning,
  review_variety_as_error: reviewWarning,
  review_fraction_not_simplified: reviewWarning,
  review_unclear_wording: reviewWarning,
  review_kit_section_incorrect: reviewItemBlocker,
  review_kit_base_text_inappropriate: reviewItemBlocker,
  review_kit_off_topic: reviewKitBlocker,
  review_kit_above_grade: reviewKitBlocker,
  review_kit_inappropriate_content: reviewKitBlocker,
  review_kit_personal_data: reviewKitBlocker,
  review_kit_style_mismatch: reviewWarning,
  render_failed: renderBlocker,
  render_item_missing: renderBlocker,
  render_overflow: renderBlocker,
  page_count_out_of_range: { stage: "render", severity: "warning", repair: null },
};

export const validationIssueDescriptionMap: Readonly<Record<ValidationIssueCode, string>> = {
  extraction_unknown_topic: "A extração apontou um assunto que não existe neste ano e disciplina.",
  extraction_unknown_unsupported_topic:
    "A extração apontou uma área não atendida que não existe nesta disciplina.",
  extraction_personal_data_dropped: "A extração copiou um dado pessoal, que foi descartado.",
  extraction_output_invalid: "A extração desta foto não seguiu o formato pedido.",
  plan_output_invalid: "O plano não seguiu o formato pedido.",
  plan_slot_mismatch:
    "O plano não traz as vagas, os assuntos ou os exemplos pedidos, na ordem pedida.",
  plan_multiple_choice_mix: "Ajuste o número de questões de múltipla escolha em cada bloco.",
  plan_contextualized_minority:
    "No simulado de Matemática, a maior parte das questões precisa ser problema contextualizado.",
  plan_base_text_invalid: "Os textos-base do plano não seguem a quantidade e os blocos pedidos.",
  other_topic_unfeasible:
    "O assunto pedido em “outro” não pode ser trabalhado só com texto e tabela.",
  kit_output_invalid: "O kit não seguiu o formato pedido.",
  kit_slot_mismatch:
    "Os itens do kit não correspondem às vagas, aos assuntos ou aos textos-base pedidos.",
  topic_coverage_below_minimum: "Algum assunto ficou com menos questões que o mínimo do bloco.",
  difficulty_distribution_mismatch: "As dificuldades do bloco fogem da distribuição fixa.",
  option_duplicate: "Dois distratores são iguais: troque um deles por outro erro plausível.",
  correct_option_mismatch: "A alternativa marcada como correta não é a resposta esperada.",
  distractor_equivalent:
    "Um distrator é equivalente à resposta correta: troque-o por um erro plausível.",
  math_recalculation_mismatch:
    "A conta da resposta, refeita com os números do enunciado, dá outro resultado.",
  math_expression_invalid:
    "Uma expressão do cálculo, da resposta ou das alternativas não pode ser avaliada: reescreva-a.",
  example_recalculation_mismatch: "A conta do exemplo resolvido, refeita, dá outro resultado.",
  evidence_quote_not_found:
    "O trecho citado no gabarito não está, literalmente, no texto-base: copie o trecho exato.",
  non_computable_excess: "Muitas questões de Matemática sem cálculo conferível.",
  expression_number_not_in_statement:
    "A expressão de cálculo usa um número que não aparece no enunciado.",
  fraction_not_simplified: "A fração da resposta não está na forma irredutível.",
  unit_missing: "A resposta de medida está sem unidade.",
  figure_reference:
    "O enunciado manda observar figura ou material que a criança não tem: traga o dado em texto ou tabela.",
  personal_data_pattern: "O texto traz telefone, e-mail ou CPF: retire o dado.",
  external_link: "O texto traz link, endereço de site ou perfil de rede social: retire-o.",
  blocked_term: "O texto traz palavra imprópria para criança: troque-a.",
  duplicate_question: "Duas questões são iguais: escreva outra questão para a vaga.",
  math_markup_invalid:
    "A marcação matemática entre \\( e \\) está aberta, fechada sem abrir ou inválida.",
  markup_forbidden: "O texto traz Markdown, HTML ou emoji: escreva só texto.",
  similar_question: "Duas questões têm enunciados muito parecidos.",
  example_similar_to_question: "Um exemplo resolvido é muito parecido com uma questão.",
  mock_hint: "Questão do simulado com dica ou referência à revisão.",
  statement_too_long: "Enunciado mais longo que o recomendado para o ano.",
  base_text_length: "Texto-base fora do tamanho recomendado para o ano.",
  review_answer_mismatch:
    "O revisor resolveu a questão e chegou a outra alternativa: confira a resposta e as alternativas.",
  review_answer_incorrect: "O revisor apontou que a resposta está errada.",
  review_answer_ambiguous: "O revisor apontou que a questão admite mais de uma resposta.",
  review_explanation_inconsistent:
    "O revisor apontou explicação ou passos que não batem com a resposta.",
  review_missing_data: "O revisor apontou que falta dado no enunciado para resolver a questão.",
  review_off_topic: "O revisor apontou que o item foge do assunto da vaga.",
  review_above_grade: "O revisor apontou conteúdo acima do ano.",
  review_inappropriate_content: "O revisor apontou conteúdo impróprio para criança.",
  review_personal_data: "O revisor apontou dado pessoal no item.",
  review_evidence_unsupported: "O revisor apontou que o trecho citado não sustenta a resposta.",
  review_example_incorrect: "O revisor apontou erro no exemplo resolvido.",
  review_weak_distractor: "O revisor apontou distrator pouco plausível.",
  review_difficulty_mismatch: "O revisor apontou dificuldade diferente da vaga.",
  review_hint_in_mock: "O revisor apontou dica numa questão do simulado.",
  review_variety_as_error: "O revisor apontou variedade linguística tratada como erro.",
  review_fraction_not_simplified: "O revisor apontou fração fora da forma irredutível.",
  review_unclear_wording: "O revisor apontou enunciado confuso.",
  review_kit_section_incorrect: "O revisor apontou erro na revisão do assunto.",
  review_kit_base_text_inappropriate:
    "O revisor apontou texto-base inadequado ao ano ou ao assunto.",
  review_kit_off_topic: "O revisor apontou que o kit foge dos assuntos pedidos.",
  review_kit_above_grade: "O revisor apontou kit acima do ano.",
  review_kit_inappropriate_content: "O revisor apontou conteúdo impróprio no kit.",
  review_kit_personal_data: "O revisor apontou dado pessoal no kit.",
  review_kit_style_mismatch: "O revisor apontou estilo diferente do material da turma.",
  render_failed: "Os PDFs não puderam ser gerados.",
  render_item_missing: "Algum item do kit não apareceu num dos PDFs.",
  render_overflow: "Algum item ficou cortado num dos PDFs.",
  page_count_out_of_range: "Um dos PDFs ficou com número de páginas fora do esperado.",
};

export const validationIssueSchema = z
  .strictObject({
    code: validationIssueCodeSchema,
    severity: validationSeveritySchema,
    stage: validationStageSchema,
    itemId: z.union([kitItemIdSchema, topicRefSchema]).nullable(),
    note: z.string().max(MAX_REVIEW_NOTE_LENGTH).nullable(),
    excerpt: z.string().max(MAX_ISSUE_EXCERPT_LENGTH).nullable(),
  })
  .refine((issue) => issue.severity === validationIssueRuleMap[issue.code].severity, {
    message: "severity must be the fixed severity of the code",
    path: ["severity"],
  })
  .refine((issue) => issue.stage === validationIssueRuleMap[issue.code].stage, {
    message: "stage must be the fixed stage of the code",
    path: ["stage"],
  });
export type ValidationIssue = z.infer<typeof validationIssueSchema>;

export type ValidationIssueDetail = {
  readonly itemId?: KitItemId | TopicRef | null;
  readonly note?: string | null;
  readonly excerpt?: string | null;
};

function truncateText(text: string | null | undefined, maxLength: number): string | null {
  if (text === undefined || text === null) return null;
  const truncated = text.slice(0, maxLength);
  return /[\uD800-\uDBFF]$/.test(truncated) ? truncated.slice(0, -1) : truncated;
}

export function createValidationIssue(
  code: ValidationIssueCode,
  detail: ValidationIssueDetail = {},
): ValidationIssue {
  const rule = validationIssueRuleMap[code];
  return {
    code,
    severity: rule.severity,
    stage: rule.stage,
    itemId: detail.itemId ?? null,
    note: truncateText(detail.note, MAX_REVIEW_NOTE_LENGTH),
    excerpt: truncateText(detail.excerpt, MAX_ISSUE_EXCERPT_LENGTH),
  };
}

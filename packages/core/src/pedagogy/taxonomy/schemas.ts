import { z } from "zod";
import { type Grade, gradeSchema, type Subject, subjectSchema } from "#src/enums.ts";
import { topicIdSchema } from "#src/order/schemas.ts";

export const TOPIC_LABEL_MAX_LENGTH = 40;
export const TOPIC_DESCRIPTION_MAX_LENGTH = 160;

export const topicValidationRuleList = [
  "rational_equivalence",
  "measurement_unit",
  "figure_free_statement",
  "text_evidence",
  "single_normative_answer",
  "linguistic_variety_respect",
] as const;
export const topicValidationRuleSchema = z.enum(topicValidationRuleList);
export type TopicValidationRule = z.infer<typeof topicValidationRuleSchema>;

export const topicValidationRuleDescriptionMap: Readonly<Record<TopicValidationRule, string>> = {
  rational_equivalence:
    "Frações, decimais e porcentagens: gabarito na forma simplificada, equivalentes aceitos e nenhum distrator equivalente à resposta (1/2, 2/4 e 0,5).",
  measurement_unit:
    "Medidas: resposta com unidade e conversão conferida; nenhum distrator igual à resposta em outra unidade.",
  figure_free_statement:
    "Figuras, plano e gráficos: o enunciado traz em texto ou tabela todo dado necessário; nenhuma questão pede para observar desenho.",
  text_evidence:
    "Leitura: a resposta se apoia num trecho do texto-base original, citado no gabarito.",
  single_normative_answer:
    "Norma-padrão: uma só resposta correta; nenhum distrator também aceito pela norma (grafia dupla, pontuação opcional).",
  linguistic_variety_respect:
    "Variedades linguísticas: nenhuma variedade tratada como erro; adequação ao contexto formal ou informal.",
};

export const topicValidationRuleSubjectMap: Readonly<Record<TopicValidationRule, Subject>> = {
  rational_equivalence: "math",
  measurement_unit: "math",
  figure_free_statement: "math",
  text_evidence: "portuguese",
  single_normative_answer: "portuguese",
  linguistic_variety_respect: "portuguese",
};

export const topicSubjectPrefixMap = { math: "ma", portuguese: "lp" } as const;

export function topicIdPrefixOf(grade: Grade, subject: Subject): string {
  return `${topicSubjectPrefixMap[subject]}${grade}-`;
}

export const taxonomyTopicIdSchema = topicIdSchema.regex(
  /^(?:ma|lp)[4-7]-[a-z0-9]+(?:-[a-z0-9]+)*$/,
);

export const bnccSkillCodeSchema = z.string().regex(/^EF\d{2}(?:MA|LP)\d{2}$/);
export type BnccSkillCode = z.infer<typeof bnccSkillCodeSchema>;

export function uniqueListSchema<T extends z.ZodType>(itemSchema: T) {
  return z.array(itemSchema).refine((itemList) => new Set(itemList).size === itemList.length, {
    message: "list must not repeat an item",
  });
}

export const topicDefinitionSchema = z.strictObject({
  topicId: taxonomyTopicIdSchema,
  label: z.string().trim().min(3).max(TOPIC_LABEL_MAX_LENGTH),
  description: z.string().trim().min(10).max(TOPIC_DESCRIPTION_MAX_LENGTH),
  bnccSkillList: uniqueListSchema(bnccSkillCodeSchema).min(1),
  prerequisiteList: uniqueListSchema(taxonomyTopicIdSchema),
  validationRuleList: uniqueListSchema(topicValidationRuleSchema),
  deprecated: z.literal(true).optional(),
});
export type TopicDefinition = z.infer<typeof topicDefinitionSchema>;

export const topicSchema = topicDefinitionSchema.extend({
  grade: gradeSchema,
  subject: subjectSchema,
});
export type Topic = z.infer<typeof topicSchema>;

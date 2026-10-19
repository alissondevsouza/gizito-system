import { MAX_TOPIC_COUNT, MOCK_QUESTION_COUNT, PRACTICE_QUESTION_COUNT } from "#src/constants.ts";
import {
  gradeLabelMap,
  gradeList,
  type Subject,
  subjectLabelMap,
  subjectList,
} from "#src/enums.ts";
import {
  type Topic,
  topicValidationRuleDescriptionMap,
  topicValidationRuleList,
  topicValidationRuleSubjectMap,
} from "#src/pedagogy/taxonomy/schemas.ts";

export const BNCC_OFFICIAL_URL = "https://basenacionalcomum.mec.gov.br/";

export type TaxonomyMarkdownInput = {
  readonly topicList: readonly Topic[];
  readonly taxonomyVersion: string;
  readonly exclusionList: readonly string[];
};

function escapeCell(text: string): string {
  return text.replaceAll("|", "\\|");
}

function codeList(itemList: readonly string[]): string {
  return itemList.length === 0 ? "—" : itemList.map((item) => `\`${item}\``).join(", ");
}

function prerequisiteCell(topic: Topic, topicById: ReadonlyMap<string, Topic>): string {
  if (topic.prerequisiteList.length === 0) return "—";
  return topic.prerequisiteList
    .map((topicId) => {
      const prerequisite = topicById.get(topicId);
      if (prerequisite === undefined) return `\`${topicId}\``;
      const gradeSuffix =
        prerequisite.grade === topic.grade ? "" : ` (${gradeLabelMap[prerequisite.grade]})`;
      return escapeCell(`${prerequisite.label}${gradeSuffix}`);
    })
    .join("; ");
}

function renderSection(
  subject: Subject,
  sectionTopicList: readonly Topic[],
  topicById: ReadonlyMap<string, Topic>,
): string[] {
  const grade = sectionTopicList[0]?.grade;
  if (grade === undefined) return [];
  const activeCount = sectionTopicList.filter((topic) => topic.deprecated !== true).length;
  return [
    `## ${subjectLabelMap[subject]} — ${gradeLabelMap[grade]} (${activeCount} ${activeCount === 1 ? "assunto" : "assuntos"})`,
    "",
    "| Id | Nome | Descrição | BNCC | Pré-requisitos | Regras |",
    "|---|---|---|---|---|---|",
    ...sectionTopicList.map((topic) => {
      const label = topic.deprecated === true ? `${topic.label} (descontinuado)` : topic.label;
      return `| \`${topic.topicId}\` | ${escapeCell(label)} | ${escapeCell(topic.description)} | ${topic.bnccSkillList.join(", ")} | ${prerequisiteCell(topic, topicById)} | ${codeList(topic.validationRuleList)} |`;
    }),
    "",
  ];
}

export function renderTaxonomyMarkdown(input: TaxonomyMarkdownInput): string {
  const topicById = new Map(input.topicList.map((topic) => [topic.topicId, topic]));
  const lineList = [
    `# Taxonomia de assuntos — ${input.taxonomyVersion}`,
    "",
    "> Gerado por `bun run taxonomy:doc` a partir de `packages/core/src/pedagogy/taxonomy/`. Não edite à mão: o teste do core falha se este arquivo divergir do código.",
    "",
    `Lista canônica de assuntos por ano e disciplina (PRD §7.7). A extração mapeia as fotos do caderno para estes assuntos, o responsável confirma até ${MAX_TOPIC_COUNT} deles como chips e a geração e as validações do kit partem deles. Um id nunca muda de sentido: assunto que sai da lista fica marcado como descontinuado.`,
    "",
    `**Como revisar.** Para cada assunto, confira se ele cabe no ano, se o nome é o que a criança vê no caderno e no livro, se as habilidades correspondem ao assunto (busque o código na [BNCC oficial](${BNCC_OFFICIAL_URL})), se os pré-requisitos fazem sentido e se dá para fazer ${PRACTICE_QUESTION_COUNT} exercícios e ${MOCK_QUESTION_COUNT} questões de prova sobre ele sem desenho. Falta ou sobra de assunto também conta.`,
    "",
    "## Regras aplicáveis",
    "",
    "Marcam o que a validação automática do kit confere a mais quando o assunto está no kit; as regras gerais (contagens, cobertura, recálculo, dado pessoal) valem para todo kit.",
    "",
    "| Regra | Disciplina | O que confere |",
    "|---|---|---|",
    ...topicValidationRuleList.map(
      (rule) =>
        `| \`${rule}\` | ${subjectLabelMap[topicValidationRuleSubjectMap[rule]]} | ${escapeCell(topicValidationRuleDescriptionMap[rule])} |`,
    ),
    "",
    "## Fora desta versão",
    "",
    "Assuntos que dependem de figura, imagem ou oralidade não entram, porque nenhuma questão do kit pode depender de figura ausente (PRD §7.2):",
    "",
    ...input.exclusionList.map((exclusion) => `- ${exclusion}`),
    "",
    ...subjectList.flatMap((subject) =>
      gradeList.flatMap((grade) =>
        renderSection(
          subject,
          input.topicList.filter((topic) => topic.subject === subject && topic.grade === grade),
          topicById,
        ),
      ),
    ),
  ];
  return `${lineList.join("\n").trimEnd()}\n`;
}

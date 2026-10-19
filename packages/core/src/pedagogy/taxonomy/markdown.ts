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
import {
  type UnsupportedTopic,
  unsupportedTopicReasonLabelMap,
} from "#src/pedagogy/taxonomy/unsupported.ts";

export const BNCC_OFFICIAL_URL = "https://basenacionalcomum.mec.gov.br/";

export type TaxonomyMarkdownInput = {
  readonly topicList: readonly Topic[];
  readonly taxonomyVersion: string;
  readonly unsupportedTopicList: readonly UnsupportedTopic[];
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
    "## Assuntos ainda não atendidos",
    "",
    "Ficam fora desta versão porque dependem de figura, imagem, fala ou correção de texto livre, e nenhuma questão do kit pode depender de figura ausente (PRD §7.2). A extração sinaliza quando o material trata deles pela coluna “Como a extração reconhece”; a prévia os mostra à parte, sem deixar confirmá-los; o “outro” que contém uma das palavras da área, na mesma disciplina do pedido, é recusado antes do Pix (PRD §7.7). As palavras casam inteiras, sem acento e sem diferença de maiúsculas.",
    "",
    "| Id | Nome | Disciplina | Motivo | O que fica de fora | Como a extração reconhece | Palavras que recusam o “outro” |",
    "|---|---|---|---|---|---|---|",
    ...input.unsupportedTopicList.map(
      (topic) =>
        `| \`${topic.unsupportedTopicId}\` | ${escapeCell(topic.label)} | ${subjectLabelMap[topic.subject]} | ${unsupportedTopicReasonLabelMap[topic.reason]} | ${escapeCell(topic.description)} | ${escapeCell(topic.recognitionCue)} | ${escapeCell(topic.keywordList.join(", "))} |`,
    ),
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

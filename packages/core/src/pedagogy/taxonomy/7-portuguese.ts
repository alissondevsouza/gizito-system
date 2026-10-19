import type { TopicDefinition } from "#src/pedagogy/taxonomy/schemas.ts";

export const grade7PortugueseTopicList: readonly TopicDefinition[] = [
  {
    topicId: "lp7-reading-comprehension",
    label: "Compreensão de texto",
    description: "Tema, informações principais e relações entre as partes de textos variados.",
    bnccSkillList: ["EF67LP28"],
    prerequisiteList: ["lp6-reading-comprehension"],
    validationRuleList: ["text_evidence"],
  },
  {
    topicId: "lp7-inference",
    label: "Inferência, humor e ironia",
    description: "Sentidos implícitos, ambiguidade, humor e ironia em textos curtos.",
    bnccSkillList: ["EF69LP05"],
    prerequisiteList: ["lp6-inference"],
    validationRuleList: ["text_evidence"],
  },
  {
    topicId: "lp7-text-cohesion",
    label: "Coesão referencial",
    description:
      "Substituições por sinônimos e pronomes que ligam as partes do texto e evitam repetição.",
    bnccSkillList: ["EF07LP12", "EF07LP13"],
    prerequisiteList: ["lp6-text-cohesion"],
    validationRuleList: ["text_evidence"],
  },
  {
    topicId: "lp7-news-reports",
    label: "Notícia e reportagem",
    description:
      "Comparar notícias e reportagens sobre o mesmo fato, sensacionalismo e confiabilidade.",
    bnccSkillList: ["EF07LP01", "EF07LP02", "EF67LP03"],
    prerequisiteList: ["lp6-news"],
    validationRuleList: ["text_evidence"],
  },
  {
    topicId: "lp7-argumentation",
    label: "Argumentação e persuasão",
    description:
      "Tese, tipos de argumento, recursos persuasivos e marcas de opinião em textos argumentativos.",
    bnccSkillList: ["EF67LP05", "EF67LP07", "EF07LP14"],
    prerequisiteList: ["lp6-opinion-texts"],
    validationRuleList: ["text_evidence"],
  },
  {
    topicId: "lp7-narrative",
    label: "Narrativa: foco, tempo e espaço",
    description:
      "Foco narrativo, tempo cronológico e psicológico, espaço e caracterização das personagens.",
    bnccSkillList: ["EF69LP47"],
    prerequisiteList: ["lp6-narrative"],
    validationRuleList: ["text_evidence"],
  },
  {
    topicId: "lp7-drama",
    label: "Texto dramático",
    description: "Personagem, ato, cena, fala, rubricas e conflito em textos teatrais.",
    bnccSkillList: ["EF67LP29"],
    prerequisiteList: ["lp5-drama"],
    validationRuleList: ["text_evidence"],
  },
  {
    topicId: "lp7-poems",
    label: "Poemas e recursos expressivos",
    description:
      "Recursos sonoros, semânticos e de forma em poemas de verso livre e de forma fixa.",
    bnccSkillList: ["EF69LP48"],
    prerequisiteList: ["lp6-poems"],
    validationRuleList: ["text_evidence"],
  },
  {
    topicId: "lp7-figures-of-speech",
    label: "Figuras de linguagem",
    description:
      "Metáfora, comparação, metonímia, personificação, hipérbole, ironia e antítese e seus efeitos.",
    bnccSkillList: ["EF67LP38", "EF69LP54"],
    prerequisiteList: ["lp6-figures-of-speech"],
    validationRuleList: ["text_evidence"],
  },
  {
    topicId: "lp7-subject-predicate",
    label: "Sujeito e predicado",
    description: "Verbo como núcleo da oração; identificar sujeito e predicado e tipos de sujeito.",
    bnccSkillList: ["EF07LP04", "EF07LP07"],
    prerequisiteList: ["lp6-sentence-clause"],
    validationRuleList: ["single_normative_answer"],
  },
  {
    topicId: "lp7-verb-transitivity",
    label: "Transitividade verbal",
    description:
      "Verbos intransitivos e transitivos diretos e indiretos; objeto direto e objeto indireto.",
    bnccSkillList: ["EF07LP05", "EF07LP07"],
    prerequisiteList: ["lp7-subject-predicate"],
    validationRuleList: ["single_normative_answer"],
  },
  {
    topicId: "lp7-adjective-modifiers",
    label: "Adjetivos na oração",
    description:
      "Adjetivos e locuções adjetivas que ampliam o sentido do sujeito ou do complemento.",
    bnccSkillList: ["EF07LP08"],
    prerequisiteList: ["lp6-adjectives", "lp7-subject-predicate"],
    validationRuleList: ["single_normative_answer"],
  },
  {
    topicId: "lp7-adverbs",
    label: "Advérbio e locução adverbial",
    description: "Advérbios e locuções adverbiais de tempo, lugar, modo, intensidade e negação.",
    bnccSkillList: ["EF07LP09"],
    prerequisiteList: ["lp6-verb-moods"],
    validationRuleList: ["single_normative_answer"],
  },
  {
    topicId: "lp7-verb-moods",
    label: "Modos e tempos verbais",
    description: "Uso dos modos e tempos verbais na produção de textos.",
    bnccSkillList: ["EF07LP10"],
    prerequisiteList: ["lp6-verb-moods"],
    validationRuleList: ["single_normative_answer"],
  },
  {
    topicId: "lp7-agreement",
    label: "Concordância nominal e verbal",
    description: "Regras básicas de concordância nominal e verbal em frases e textos.",
    bnccSkillList: ["EF07LP06"],
    prerequisiteList: ["lp6-agreement"],
    validationRuleList: ["single_normative_answer"],
  },
  {
    topicId: "lp7-compound-sentences",
    label: "Período composto: adição e oposição",
    description:
      "Orações ligadas por vírgula ou pelas conjunções e, mas e porém, com sentido de soma ou oposição.",
    bnccSkillList: ["EF07LP11"],
    prerequisiteList: ["lp6-sentence-clause"],
    validationRuleList: ["single_normative_answer"],
  },
  {
    topicId: "lp7-word-formation",
    label: "Prefixos e sufixos",
    description: "Formar palavras derivadas com os prefixos e sufixos mais usados no português.",
    bnccSkillList: ["EF07LP03"],
    prerequisiteList: ["lp6-word-formation"],
    validationRuleList: ["single_normative_answer"],
  },
  {
    topicId: "lp7-spelling-accentuation",
    label: "Ortografia e acentuação",
    description: "Grafia de palavras com dúvidas frequentes e regras de acentuação gráfica.",
    bnccSkillList: ["EF67LP32"],
    prerequisiteList: ["lp6-spelling", "lp6-accentuation"],
    validationRuleList: ["single_normative_answer"],
  },
  {
    topicId: "lp7-punctuation",
    label: "Pontuação",
    description: "Uso da vírgula, do ponto e vírgula e dos dois-pontos e seus efeitos de sentido.",
    bnccSkillList: ["EF67LP33"],
    prerequisiteList: ["lp6-punctuation"],
    validationRuleList: ["single_normative_answer", "text_evidence"],
  },
  {
    topicId: "lp7-linguistic-variety",
    label: "Variedades linguísticas e norma",
    description:
      "Variedades da língua, norma-padrão e preconceito linguístico; formal e informal conforme a situação.",
    bnccSkillList: ["EF69LP55", "EF69LP56"],
    prerequisiteList: ["lp6-linguistic-variety"],
    validationRuleList: ["linguistic_variety_respect", "text_evidence"],
  },
];

import type { TopicDefinition } from "#src/pedagogy/taxonomy/schemas.ts";

export const grade6PortugueseTopicList: readonly TopicDefinition[] = [
  {
    topicId: "lp6-reading-comprehension",
    label: "Compreensão de texto",
    description:
      "Localizar informações, identificar o tema e relacionar partes de textos variados.",
    bnccSkillList: ["EF67LP28"],
    prerequisiteList: ["lp5-explicit-information", "lp5-main-idea"],
    validationRuleList: ["text_evidence"],
  },
  {
    topicId: "lp6-inference",
    label: "Inferência, humor e ironia",
    description: "Sentidos implícitos e efeitos de humor e ironia criados pelo uso das palavras.",
    bnccSkillList: ["EF69LP05"],
    prerequisiteList: ["lp5-inference-humor"],
    validationRuleList: ["text_evidence"],
  },
  {
    topicId: "lp6-word-meaning",
    label: "Sinônimos e sentido das palavras",
    description: "Diferenças de sentido entre sinônimos e escolha da palavra adequada ao contexto.",
    bnccSkillList: ["EF06LP03"],
    prerequisiteList: ["lp5-word-meaning"],
    validationRuleList: ["text_evidence"],
  },
  {
    topicId: "lp6-text-cohesion",
    label: "Coesão: retomadas no texto",
    description: "Pronomes, sinônimos e expressões que retomam termos e evitam repetição.",
    bnccSkillList: ["EF06LP12", "EF67LP36"],
    prerequisiteList: ["lp5-text-cohesion"],
    validationRuleList: ["text_evidence"],
  },
  {
    topicId: "lp6-news",
    label: "Notícia",
    description:
      "Manchete, lide, fato central e circunstâncias; escolhas do autor que tornam o relato parcial.",
    bnccSkillList: ["EF69LP03", "EF69LP16", "EF06LP01"],
    prerequisiteList: ["lp5-news-reports"],
    validationRuleList: ["text_evidence"],
  },
  {
    topicId: "lp6-fact-opinion",
    label: "Fato e opinião",
    description: "Distinguir o fato da opinião sobre ele em trechos de textos jornalísticos.",
    bnccSkillList: ["EF67LP04"],
    prerequisiteList: ["lp5-opinion-arguments"],
    validationRuleList: ["text_evidence"],
  },
  {
    topicId: "lp6-opinion-texts",
    label: "Textos de opinião",
    description:
      "Tese, argumentos e recursos de persuasão em cartas de leitor, comentários e resenhas.",
    bnccSkillList: ["EF67LP05", "EF67LP07"],
    prerequisiteList: ["lp6-fact-opinion"],
    validationRuleList: ["text_evidence"],
  },
  {
    topicId: "lp6-narrative",
    label: "Narrativa e foco narrativo",
    description:
      "Enredo, personagens, tempo, espaço, narrador e foco narrativo em contos, lendas e mitos.",
    bnccSkillList: ["EF69LP47", "EF67LP28"],
    prerequisiteList: ["lp5-narrative"],
    validationRuleList: ["text_evidence"],
  },
  {
    topicId: "lp6-direct-indirect-speech",
    label: "Discurso direto e indireto",
    description:
      "Vozes do narrador e das personagens e passagem do discurso direto para o indireto.",
    bnccSkillList: ["EF06LP12", "EF69LP47"],
    prerequisiteList: ["lp5-direct-indirect-speech"],
    validationRuleList: ["text_evidence"],
  },
  {
    topicId: "lp6-poems",
    label: "Poemas e recursos expressivos",
    description: "Estrofes, rimas, ritmo, aliterações e linguagem figurada em poemas.",
    bnccSkillList: ["EF69LP48"],
    prerequisiteList: ["lp5-poems"],
    validationRuleList: ["text_evidence"],
  },
  {
    topicId: "lp6-figures-of-speech",
    label: "Figuras de linguagem",
    description: "Comparação, metáfora, personificação, hipérbole e onomatopeia e seus efeitos.",
    bnccSkillList: ["EF67LP38"],
    prerequisiteList: ["lp5-poems"],
    validationRuleList: ["text_evidence"],
  },
  {
    topicId: "lp6-nouns",
    label: "Substantivo",
    description: "Classificação dos substantivos e flexão de gênero, número e grau.",
    bnccSkillList: ["EF06LP04"],
    prerequisiteList: ["lp4-nouns-adjectives"],
    validationRuleList: ["single_normative_answer"],
  },
  {
    topicId: "lp6-adjectives",
    label: "Adjetivo e locução adjetiva",
    description:
      "Função e flexão dos adjetivos, graus comparativo e superlativo e locuções adjetivas.",
    bnccSkillList: ["EF06LP04"],
    prerequisiteList: ["lp6-nouns"],
    validationRuleList: ["single_normative_answer"],
  },
  {
    topicId: "lp6-pronouns",
    label: "Pronomes",
    description:
      "Pronomes pessoais retos e oblíquos, possessivos e demonstrativos e seu papel na coesão.",
    bnccSkillList: ["EF06LP12"],
    prerequisiteList: ["lp5-pronouns"],
    validationRuleList: ["single_normative_answer"],
  },
  {
    topicId: "lp6-verb-moods",
    label: "Verbos: tempos e modos",
    description:
      "Flexão nos modos indicativo, subjuntivo e imperativo e o efeito de sentido de cada modo.",
    bnccSkillList: ["EF06LP04", "EF06LP05"],
    prerequisiteList: ["lp5-verb-tenses"],
    validationRuleList: ["single_normative_answer"],
  },
  {
    topicId: "lp6-agreement",
    label: "Concordância nominal e verbal",
    description:
      "Concordância do substantivo com seus determinantes e do verbo com o sujeito simples ou composto.",
    bnccSkillList: ["EF06LP06"],
    prerequisiteList: ["lp5-verb-agreement", "lp5-nominal-agreement"],
    validationRuleList: ["single_normative_answer"],
  },
  {
    topicId: "lp6-sentence-clause",
    label: "Frase, oração e período",
    description: "Oração organizada em torno de um verbo; período simples e período composto.",
    bnccSkillList: ["EF06LP07", "EF06LP08", "EF06LP09"],
    prerequisiteList: ["lp6-verb-moods"],
    validationRuleList: ["single_normative_answer"],
  },
  {
    topicId: "lp6-spelling",
    label: "Ortografia",
    description: "Escrita correta de palavras com dúvidas frequentes, como s, z, x, ch, g e j.",
    bnccSkillList: ["EF67LP32"],
    prerequisiteList: ["lp5-spelling"],
    validationRuleList: ["single_normative_answer"],
  },
  {
    topicId: "lp6-accentuation",
    label: "Acentuação gráfica",
    description:
      "Regras de acentuação de oxítonas, paroxítonas, proparoxítonas e monossílabos tônicos.",
    bnccSkillList: ["EF67LP32"],
    prerequisiteList: ["lp5-accentuation"],
    validationRuleList: ["single_normative_answer"],
  },
  {
    topicId: "lp6-punctuation",
    label: "Pontuação",
    description: "Pontuação de frases e de diálogos e os efeitos de sentido da pontuação.",
    bnccSkillList: ["EF67LP33"],
    prerequisiteList: ["lp5-punctuation"],
    validationRuleList: ["single_normative_answer", "text_evidence"],
  },
  {
    topicId: "lp6-word-formation",
    label: "Formação de palavras",
    description:
      "Derivação por prefixo e sufixo, composição e antônimos formados com prefixos de negação.",
    bnccSkillList: ["EF67LP34", "EF67LP35"],
    prerequisiteList: ["lp5-word-formation"],
    validationRuleList: ["single_normative_answer"],
  },
  {
    topicId: "lp6-linguistic-variety",
    label: "Variedades linguísticas e norma",
    description:
      "Variedades da língua, norma-padrão, preconceito linguístico e adequação ao contexto.",
    bnccSkillList: ["EF69LP55", "EF69LP56"],
    prerequisiteList: ["lp5-linguistic-variety"],
    validationRuleList: ["linguistic_variety_respect", "text_evidence"],
  },
];

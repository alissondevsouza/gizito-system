import type { TopicDefinition } from "#src/pedagogy/taxonomy/schemas.ts";

export const grade6MathTopicList: readonly TopicDefinition[] = [
  {
    topicId: "ma6-natural-decimal-numbers",
    label: "Números naturais e decimais",
    description: "Ler, escrever, comparar e ordenar naturais e decimais usando a reta numérica.",
    bnccSkillList: ["EF06MA01"],
    prerequisiteList: ["ma5-natural-numbers", "ma5-decimal-numbers"],
    validationRuleList: ["rational_equivalence"],
  },
  {
    topicId: "ma6-numeral-systems",
    label: "Sistemas de numeração",
    description:
      "Características do sistema decimal comparadas às de outros sistemas, como o romano.",
    bnccSkillList: ["EF06MA02"],
    prerequisiteList: ["ma5-natural-numbers"],
    validationRuleList: [],
  },
  {
    topicId: "ma6-natural-operations",
    label: "Operações com números naturais",
    description: "As quatro operações com naturais por cálculo mental, escrito e estimativa.",
    bnccSkillList: ["EF06MA03"],
    prerequisiteList: ["ma5-multiplication-division"],
    validationRuleList: [],
  },
  {
    topicId: "ma6-powers-roots",
    label: "Potenciação e raiz quadrada",
    description:
      "Potências de naturais, quadrados perfeitos e raiz quadrada exata, com potências de 10.",
    bnccSkillList: ["EF06MA03"],
    prerequisiteList: ["ma6-natural-operations"],
    validationRuleList: [],
  },
  {
    topicId: "ma6-numeric-expressions",
    label: "Expressões numéricas",
    description: "Ordem das operações em expressões com parênteses, colchetes, chaves e potências.",
    bnccSkillList: ["EF06MA03"],
    prerequisiteList: ["ma6-natural-operations", "ma6-powers-roots"],
    validationRuleList: [],
  },
  {
    topicId: "ma6-multiples-divisors",
    label: "Múltiplos, divisores e primos",
    description: "Múltiplos, divisores, critérios de divisibilidade e números primos e compostos.",
    bnccSkillList: ["EF06MA05", "EF06MA06"],
    prerequisiteList: ["ma4-multiples-sequences", "ma6-natural-operations"],
    validationRuleList: [],
  },
  {
    topicId: "ma6-lcm-gcd",
    label: "MMC e MDC",
    description:
      "Decomposição em fatores primos, mínimo múltiplo comum e máximo divisor comum em problemas.",
    bnccSkillList: ["EF06MA06"],
    prerequisiteList: ["ma6-multiples-divisors"],
    validationRuleList: [],
  },
  {
    topicId: "ma6-fractions",
    label: "Frações: comparação e equivalência",
    description:
      "Fração como parte e como divisão, frações equivalentes, simplificação e comparação.",
    bnccSkillList: ["EF06MA07"],
    prerequisiteList: ["ma5-equivalent-fractions", "ma5-comparing-rationals"],
    validationRuleList: ["rational_equivalence"],
  },
  {
    topicId: "ma6-fraction-decimal",
    label: "Frações e decimais",
    description:
      "Passar de fração para decimal e de decimal para fração e localizar na reta numérica.",
    bnccSkillList: ["EF06MA08"],
    prerequisiteList: ["ma6-fractions", "ma6-natural-decimal-numbers"],
    validationRuleList: ["rational_equivalence"],
  },
  {
    topicId: "ma6-fraction-of-quantity",
    label: "Fração de uma quantidade",
    description: "Calcular uma fração de uma quantidade com resultado natural.",
    bnccSkillList: ["EF06MA09"],
    prerequisiteList: ["ma6-fractions"],
    validationRuleList: ["rational_equivalence"],
  },
  {
    topicId: "ma6-fraction-addition-subtraction",
    label: "Adição e subtração de frações",
    description: "Somar e subtrair frações com denominadores iguais e diferentes.",
    bnccSkillList: ["EF06MA10"],
    prerequisiteList: ["ma6-fractions", "ma6-lcm-gcd"],
    validationRuleList: ["rational_equivalence"],
  },
  {
    topicId: "ma6-decimal-operations",
    label: "Operações com decimais",
    description:
      "Adição, subtração, multiplicação, divisão e potenciação com decimais; arredondamento e estimativa.",
    bnccSkillList: ["EF06MA11", "EF06MA12"],
    prerequisiteList: ["ma6-natural-decimal-numbers", "ma5-multiplication-division"],
    validationRuleList: ["rational_equivalence"],
  },
  {
    topicId: "ma6-percentage",
    label: "Porcentagem",
    description:
      "Calcular porcentagens por proporcionalidade, sem regra de três, em compras e descontos.",
    bnccSkillList: ["EF06MA13"],
    prerequisiteList: ["ma5-percentage", "ma6-fraction-of-quantity"],
    validationRuleList: ["rational_equivalence"],
  },
  {
    topicId: "ma6-unknown-value",
    label: "Igualdades e valor desconhecido",
    description:
      "Usar as propriedades da igualdade para encontrar um valor desconhecido em problemas.",
    bnccSkillList: ["EF06MA14"],
    prerequisiteList: ["ma5-unknown-term"],
    validationRuleList: [],
  },
  {
    topicId: "ma6-sharing-ratio",
    label: "Partilha e razão",
    description:
      "Dividir uma quantidade em partes desiguais e expressar a razão entre as partes e o todo.",
    bnccSkillList: ["EF06MA15"],
    prerequisiteList: ["ma5-unequal-sharing", "ma6-fractions"],
    validationRuleList: ["rational_equivalence"],
  },
  {
    topicId: "ma6-cartesian-plane",
    label: "Plano cartesiano",
    description:
      "Pares ordenados e localização de pontos e de vértices de polígonos no 1º quadrante.",
    bnccSkillList: ["EF06MA16"],
    prerequisiteList: ["ma5-coordinates"],
    validationRuleList: ["figure_free_statement"],
  },
  {
    topicId: "ma6-prisms-pyramids",
    label: "Vértices, faces e arestas",
    description:
      "Relação entre o número de vértices, faces e arestas de prismas e pirâmides e o polígono da base.",
    bnccSkillList: ["EF06MA17"],
    prerequisiteList: ["ma5-solids"],
    validationRuleList: ["figure_free_statement"],
  },
  {
    topicId: "ma6-polygons",
    label: "Polígonos regulares",
    description:
      "Classificar polígonos em regulares e não regulares por lados, vértices e ângulos.",
    bnccSkillList: ["EF06MA18"],
    prerequisiteList: ["ma5-polygons"],
    validationRuleList: ["figure_free_statement"],
  },
  {
    topicId: "ma6-angles",
    label: "Ângulos",
    description: "Ângulo como abertura; medida em graus; ângulos agudos, retos e obtusos.",
    bnccSkillList: ["EF06MA25", "EF06MA26", "EF06MA27"],
    prerequisiteList: ["ma4-right-angles"],
    validationRuleList: ["measurement_unit", "figure_free_statement"],
  },
  {
    topicId: "ma6-triangles",
    label: "Classificação de triângulos",
    description: "Classificar triângulos quanto às medidas dos lados e dos ângulos.",
    bnccSkillList: ["EF06MA19"],
    prerequisiteList: ["ma6-polygons", "ma6-angles"],
    validationRuleList: ["figure_free_statement"],
  },
  {
    topicId: "ma6-quadrilaterals",
    label: "Quadriláteros",
    description:
      "Classificar quadriláteros por lados e ângulos: paralelogramos, retângulos, losangos, quadrados e trapézios.",
    bnccSkillList: ["EF06MA20"],
    prerequisiteList: ["ma6-polygons"],
    validationRuleList: ["figure_free_statement"],
  },
  {
    topicId: "ma6-measurement",
    label: "Grandezas e medidas",
    description:
      "Problemas de comprimento, massa, tempo, temperatura, capacidade e volume com conversões.",
    bnccSkillList: ["EF06MA24"],
    prerequisiteList: ["ma5-measurement-conversions"],
    validationRuleList: ["measurement_unit"],
  },
  {
    topicId: "ma6-perimeter-area",
    label: "Perímetro e área",
    description:
      "Perímetro e área de retângulos e triângulos sem fórmula pronta; o que muda ao dobrar os lados.",
    bnccSkillList: ["EF06MA24", "EF06MA29"],
    prerequisiteList: ["ma5-perimeter-area"],
    validationRuleList: ["measurement_unit", "figure_free_statement"],
  },
  {
    topicId: "ma6-probability",
    label: "Probabilidade",
    description: "Probabilidade de um evento em fração, decimal e porcentagem.",
    bnccSkillList: ["EF06MA30"],
    prerequisiteList: ["ma5-probability", "ma6-fraction-decimal"],
    validationRuleList: ["rational_equivalence"],
  },
  {
    topicId: "ma6-tables-graphs",
    label: "Tabelas e gráficos",
    description:
      "Título, eixos, legenda e fonte de um gráfico e interpretação de dados em tabelas e gráficos.",
    bnccSkillList: ["EF06MA31", "EF06MA32"],
    prerequisiteList: ["ma5-tables-graphs"],
    validationRuleList: ["figure_free_statement"],
  },
];

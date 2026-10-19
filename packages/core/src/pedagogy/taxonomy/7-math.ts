import type { TopicDefinition } from "#src/pedagogy/taxonomy/schemas.ts";

export const grade7MathTopicList: readonly TopicDefinition[] = [
  {
    topicId: "ma7-lcm-gcd",
    label: "Múltiplos e divisores: MMC e MDC",
    description:
      "Problemas com múltiplos e divisores, incluindo mínimo múltiplo comum e máximo divisor comum.",
    bnccSkillList: ["EF07MA01"],
    prerequisiteList: ["ma6-lcm-gcd"],
    validationRuleList: [],
  },
  {
    topicId: "ma7-percentage",
    label: "Porcentagem: acréscimos e descontos",
    description: "Problemas de acréscimo e desconto simples em contextos de educação financeira.",
    bnccSkillList: ["EF07MA02"],
    prerequisiteList: ["ma6-percentage"],
    validationRuleList: ["rational_equivalence"],
  },
  {
    topicId: "ma7-integers",
    label: "Números inteiros",
    description:
      "Números negativos em temperaturas, saldos e altitudes; comparação, reta numérica, módulo e oposto.",
    bnccSkillList: ["EF07MA03"],
    prerequisiteList: ["ma6-natural-decimal-numbers"],
    validationRuleList: [],
  },
  {
    topicId: "ma7-integer-addition-subtraction",
    label: "Adição e subtração de inteiros",
    description: "Somar e subtrair números inteiros em problemas.",
    bnccSkillList: ["EF07MA03", "EF07MA04"],
    prerequisiteList: ["ma7-integers"],
    validationRuleList: [],
  },
  {
    topicId: "ma7-integer-multiplication-division",
    label: "Multiplicação e divisão de inteiros",
    description: "Regra de sinais na multiplicação, na divisão e na potenciação de inteiros.",
    bnccSkillList: ["EF07MA04"],
    prerequisiteList: ["ma7-integer-addition-subtraction"],
    validationRuleList: [],
  },
  {
    topicId: "ma7-fractions-ratio",
    label: "Frações: razão e operador",
    description:
      "Comparar e ordenar frações como parte, divisão, razão e operador; razão como fração.",
    bnccSkillList: ["EF07MA08", "EF07MA09"],
    prerequisiteList: ["ma6-fractions"],
    validationRuleList: ["rational_equivalence"],
  },
  {
    topicId: "ma7-rational-numbers",
    label: "Números racionais",
    description:
      "Racionais positivos e negativos em fração e em decimal; comparação e reta numérica.",
    bnccSkillList: ["EF07MA10"],
    prerequisiteList: ["ma7-integers", "ma6-fraction-decimal"],
    validationRuleList: ["rational_equivalence"],
  },
  {
    topicId: "ma7-rational-operations",
    label: "Operações com racionais",
    description:
      "Adição, subtração, multiplicação e divisão de frações e decimais positivos e negativos.",
    bnccSkillList: ["EF07MA11", "EF07MA12"],
    prerequisiteList: [
      "ma7-rational-numbers",
      "ma6-fraction-addition-subtraction",
      "ma7-integer-multiplication-division",
    ],
    validationRuleList: ["rational_equivalence"],
  },
  {
    topicId: "ma7-algebraic-expressions",
    label: "Expressões algébricas",
    description:
      "Letras como variável e como incógnita; escrever expressões e calcular o seu valor numérico.",
    bnccSkillList: ["EF07MA13"],
    prerequisiteList: ["ma6-numeric-expressions"],
    validationRuleList: [],
  },
  {
    topicId: "ma7-sequences",
    label: "Sequências e regularidades",
    description:
      "Sequências recursivas e não recursivas; regularidades escritas com letras e expressões equivalentes.",
    bnccSkillList: ["EF07MA14", "EF07MA15", "EF07MA16"],
    prerequisiteList: ["ma7-algebraic-expressions"],
    validationRuleList: [],
  },
  {
    topicId: "ma7-linear-equations",
    label: "Equações do 1º grau",
    description: "Resolver e montar problemas com equações do tipo ax + b = c.",
    bnccSkillList: ["EF07MA18"],
    prerequisiteList: [
      "ma7-algebraic-expressions",
      "ma6-unknown-value",
      "ma7-integer-addition-subtraction",
    ],
    validationRuleList: [],
  },
  {
    topicId: "ma7-proportionality",
    label: "Grandezas proporcionais",
    description: "Grandezas direta e inversamente proporcionais e regra de três simples.",
    bnccSkillList: ["EF07MA17"],
    prerequisiteList: ["ma5-direct-proportion", "ma7-fractions-ratio"],
    validationRuleList: ["measurement_unit"],
  },
  {
    topicId: "ma7-cartesian-symmetry",
    label: "Simetria no plano cartesiano",
    description:
      "Simétrico de um ponto em relação aos eixos e à origem e coordenadas multiplicadas por um inteiro.",
    bnccSkillList: ["EF07MA19", "EF07MA20"],
    prerequisiteList: ["ma6-cartesian-plane", "ma7-integers"],
    validationRuleList: ["figure_free_statement"],
  },
  {
    topicId: "ma7-circle",
    label: "Circunferência e o número π",
    description:
      "Raio, diâmetro e comprimento da circunferência calculado com π a partir de medidas dadas.",
    bnccSkillList: ["EF07MA22", "EF07MA33"],
    prerequisiteList: ["ma6-decimal-operations"],
    validationRuleList: ["measurement_unit", "figure_free_statement"],
  },
  {
    topicId: "ma7-parallel-lines-angles",
    label: "Ângulos e retas paralelas",
    description:
      "Ângulos opostos pelo vértice, complementares, suplementares e os formados por paralelas e uma transversal.",
    bnccSkillList: ["EF07MA23"],
    prerequisiteList: ["ma6-angles"],
    validationRuleList: ["measurement_unit", "figure_free_statement"],
  },
  {
    topicId: "ma7-triangles",
    label: "Triângulos: existência e ângulos",
    description: "Condição de existência de um triângulo e soma dos ângulos internos igual a 180°.",
    bnccSkillList: ["EF07MA24", "EF07MA25"],
    prerequisiteList: ["ma6-triangles"],
    validationRuleList: ["measurement_unit", "figure_free_statement"],
  },
  {
    topicId: "ma7-polygon-angles",
    label: "Ângulos de polígonos",
    description: "Ângulos internos e externos de polígonos regulares, sem fórmula pronta.",
    bnccSkillList: ["EF07MA27"],
    prerequisiteList: ["ma7-triangles", "ma6-polygons"],
    validationRuleList: ["measurement_unit", "figure_free_statement"],
  },
  {
    topicId: "ma7-measurement",
    label: "Grandezas e medidas",
    description: "Problemas com medidas em situações do cotidiano, com conversões e aproximações.",
    bnccSkillList: ["EF07MA29"],
    prerequisiteList: ["ma6-measurement"],
    validationRuleList: ["measurement_unit"],
  },
  {
    topicId: "ma7-volume",
    label: "Volume de blocos retangulares",
    description: "Volume em metros, decímetros e centímetros cúbicos e relação com litros.",
    bnccSkillList: ["EF07MA30"],
    prerequisiteList: ["ma5-volume", "ma6-measurement"],
    validationRuleList: ["measurement_unit", "figure_free_statement"],
  },
  {
    topicId: "ma7-area",
    label: "Área de triângulos e quadriláteros",
    description:
      "Expressões para a área de triângulos, paralelogramos e trapézios e de figuras compostas por eles.",
    bnccSkillList: ["EF07MA31", "EF07MA32"],
    prerequisiteList: ["ma6-perimeter-area", "ma6-quadrilaterals"],
    validationRuleList: ["measurement_unit", "figure_free_statement"],
  },
  {
    topicId: "ma7-probability",
    label: "Probabilidade e frequência",
    description:
      "Probabilidade calculada e estimada pela frequência de resultados em experimentos repetidos.",
    bnccSkillList: ["EF07MA34"],
    prerequisiteList: ["ma6-probability"],
    validationRuleList: ["rational_equivalence"],
  },
  {
    topicId: "ma7-mean",
    label: "Média aritmética",
    description: "Calcular e interpretar a média e a amplitude de um conjunto de dados.",
    bnccSkillList: ["EF07MA35"],
    prerequisiteList: ["ma6-decimal-operations"],
    validationRuleList: ["rational_equivalence"],
  },
  {
    topicId: "ma7-statistics",
    label: "Pesquisa e gráfico de setores",
    description:
      "População e amostra e interpretação de dados em tabelas e gráficos, inclusive de setores.",
    bnccSkillList: ["EF07MA36", "EF07MA37"],
    prerequisiteList: ["ma6-tables-graphs", "ma6-percentage"],
    validationRuleList: ["figure_free_statement"],
  },
];

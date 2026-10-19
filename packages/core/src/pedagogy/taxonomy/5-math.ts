import type { TopicDefinition } from "#src/pedagogy/taxonomy/schemas.ts";

export const grade5MathTopicList: readonly TopicDefinition[] = [
  {
    topicId: "ma5-natural-numbers",
    label: "Números até a centena de milhar",
    description:
      "Ler, escrever, comparar e ordenar números naturais até 999.999 com valor posicional.",
    bnccSkillList: ["EF05MA01"],
    prerequisiteList: ["ma4-place-value"],
    validationRuleList: [],
  },
  {
    topicId: "ma5-decimal-numbers",
    label: "Números decimais",
    description:
      "Ler, escrever e decompor decimais com décimos, centésimos e milésimos e localizá-los na reta numérica.",
    bnccSkillList: ["EF05MA02"],
    prerequisiteList: ["ma4-decimals-money"],
    validationRuleList: ["rational_equivalence"],
  },
  {
    topicId: "ma5-fractions",
    label: "Frações: parte do todo e divisão",
    description:
      "Frações menores e maiores que a unidade, números mistos e fração como resultado de divisão.",
    bnccSkillList: ["EF05MA03"],
    prerequisiteList: ["ma4-unit-fractions"],
    validationRuleList: ["rational_equivalence"],
  },
  {
    topicId: "ma5-equivalent-fractions",
    label: "Frações equivalentes",
    description: "Reconhecer e obter frações equivalentes e simplificar frações.",
    bnccSkillList: ["EF05MA04"],
    prerequisiteList: ["ma5-fractions"],
    validationRuleList: ["rational_equivalence"],
  },
  {
    topicId: "ma5-comparing-rationals",
    label: "Comparação de frações e decimais",
    description: "Comparar e ordenar frações e decimais e relacioná-los a pontos da reta numérica.",
    bnccSkillList: ["EF05MA05"],
    prerequisiteList: ["ma5-equivalent-fractions", "ma5-decimal-numbers"],
    validationRuleList: ["rational_equivalence"],
  },
  {
    topicId: "ma5-percentage",
    label: "Porcentagem",
    description:
      "10%, 25%, 50%, 75% e 100% como décima parte, quarta parte, metade, três quartos e inteiro.",
    bnccSkillList: ["EF05MA06"],
    prerequisiteList: ["ma5-fractions"],
    validationRuleList: ["rational_equivalence"],
  },
  {
    topicId: "ma5-addition-subtraction",
    label: "Adição e subtração com decimais",
    description:
      "Adição e subtração com naturais e decimais por algoritmo, cálculo mental e estimativa.",
    bnccSkillList: ["EF05MA07"],
    prerequisiteList: ["ma4-addition-subtraction", "ma5-decimal-numbers"],
    validationRuleList: ["rational_equivalence"],
  },
  {
    topicId: "ma5-multiplication-division",
    label: "Multiplicação e divisão com decimais",
    description:
      "Multiplicação e divisão com naturais e decimais, com multiplicador e divisor naturais.",
    bnccSkillList: ["EF05MA08"],
    prerequisiteList: ["ma4-multiplication", "ma4-division", "ma5-decimal-numbers"],
    validationRuleList: ["rational_equivalence"],
  },
  {
    topicId: "ma5-counting-principle",
    label: "Princípio multiplicativo",
    description: "Contar possibilidades com árvore de possibilidades ou tabela.",
    bnccSkillList: ["EF05MA09"],
    prerequisiteList: ["ma4-counting"],
    validationRuleList: [],
  },
  {
    topicId: "ma5-unknown-term",
    label: "Igualdades e termo desconhecido",
    description:
      "A igualdade se mantém ao operar os dois membros pelo mesmo número; problemas com um termo desconhecido.",
    bnccSkillList: ["EF05MA10", "EF05MA11"],
    prerequisiteList: ["ma4-unknown-term"],
    validationRuleList: [],
  },
  {
    topicId: "ma5-direct-proportion",
    label: "Proporcionalidade",
    description:
      "Quantidades que variam na mesma proporção: preço por unidade, receitas e escalas de mapa.",
    bnccSkillList: ["EF05MA12"],
    prerequisiteList: ["ma5-multiplication-division"],
    validationRuleList: ["measurement_unit"],
  },
  {
    topicId: "ma5-unequal-sharing",
    label: "Partilha em partes desiguais",
    description: "Dividir uma quantidade em duas partes em que uma é o dobro ou o triplo da outra.",
    bnccSkillList: ["EF05MA13"],
    prerequisiteList: ["ma4-division"],
    validationRuleList: [],
  },
  {
    topicId: "ma5-coordinates",
    label: "Coordenadas no plano",
    description:
      "Localizar pontos e descrever deslocamentos no 1º quadrante do plano cartesiano por coordenadas.",
    bnccSkillList: ["EF05MA14", "EF05MA15"],
    prerequisiteList: ["ma4-location-movement"],
    validationRuleList: ["figure_free_statement"],
  },
  {
    topicId: "ma5-solids",
    label: "Figuras espaciais",
    description:
      "Prismas, pirâmides, cilindros e cones: faces, vértices, arestas e superfícies planas ou arredondadas.",
    bnccSkillList: ["EF05MA16"],
    prerequisiteList: ["ma4-prisms-pyramids"],
    validationRuleList: ["figure_free_statement"],
  },
  {
    topicId: "ma5-polygons",
    label: "Polígonos",
    description:
      "Reconhecer, nomear e comparar polígonos pelo número de lados, vértices e ângulos.",
    bnccSkillList: ["EF05MA17"],
    prerequisiteList: ["ma4-right-angles"],
    validationRuleList: ["figure_free_statement"],
  },
  {
    topicId: "ma5-measurement-conversions",
    label: "Medidas e conversões",
    description:
      "Comprimento, massa, capacidade, tempo e temperatura com conversões entre as unidades usuais.",
    bnccSkillList: ["EF05MA19"],
    prerequisiteList: ["ma4-length-mass-capacity", "ma4-time"],
    validationRuleList: ["measurement_unit"],
  },
  {
    topicId: "ma5-perimeter-area",
    label: "Perímetro e área",
    description:
      "Perímetro e área de retângulos; figuras com o mesmo perímetro e áreas diferentes, e vice-versa.",
    bnccSkillList: ["EF05MA19", "EF05MA20"],
    prerequisiteList: ["ma4-perimeter", "ma4-area-units"],
    validationRuleList: ["measurement_unit", "figure_free_statement"],
  },
  {
    topicId: "ma5-volume",
    label: "Volume com cubinhos",
    description: "Volume como a quantidade de cubinhos que formam um bloco retangular.",
    bnccSkillList: ["EF05MA21"],
    prerequisiteList: ["ma4-multiplication", "ma4-prisms-pyramids"],
    validationRuleList: ["measurement_unit", "figure_free_statement"],
  },
  {
    topicId: "ma5-probability",
    label: "Probabilidade",
    description:
      "Resultados possíveis de um experimento e probabilidade de eventos igualmente prováveis.",
    bnccSkillList: ["EF05MA22", "EF05MA23"],
    prerequisiteList: ["ma4-chance", "ma5-fractions"],
    validationRuleList: ["rational_equivalence"],
  },
  {
    topicId: "ma5-tables-graphs",
    label: "Tabelas e gráficos",
    description: "Interpretar dados em tabelas e em gráficos de colunas e de linhas.",
    bnccSkillList: ["EF05MA24", "EF05MA25"],
    prerequisiteList: ["ma4-tables-graphs"],
    validationRuleList: ["figure_free_statement"],
  },
];

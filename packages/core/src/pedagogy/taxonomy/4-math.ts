import type { TopicDefinition } from "#src/pedagogy/taxonomy/schemas.ts";

export const grade4MathTopicList: readonly TopicDefinition[] = [
  {
    topicId: "ma4-natural-numbers",
    label: "Números até a dezena de milhar",
    description: "Ler, escrever, comparar e ordenar números naturais até 99.999.",
    bnccSkillList: ["EF04MA01"],
    prerequisiteList: [],
    validationRuleList: [],
  },
  {
    topicId: "ma4-place-value",
    label: "Valor posicional e decomposição",
    description:
      "Unidades, dezenas, centenas e milhares; compor e decompor números com adições e multiplicações por 10, 100 e 1.000.",
    bnccSkillList: ["EF04MA02"],
    prerequisiteList: ["ma4-natural-numbers"],
    validationRuleList: [],
  },
  {
    topicId: "ma4-addition-subtraction",
    label: "Adição e subtração",
    description:
      "Algoritmos, cálculo mental e estimativa em problemas de juntar, acrescentar, retirar e comparar.",
    bnccSkillList: ["EF04MA03", "EF04MA05"],
    prerequisiteList: ["ma4-place-value"],
    validationRuleList: [],
  },
  {
    topicId: "ma4-multiplication",
    label: "Multiplicação",
    description:
      "Tabuada, multiplicação por números de um e dois algarismos, organização retangular e proporcionalidade.",
    bnccSkillList: ["EF04MA05", "EF04MA06"],
    prerequisiteList: ["ma4-addition-subtraction"],
    validationRuleList: [],
  },
  {
    topicId: "ma4-division",
    label: "Divisão",
    description:
      "Divisão com divisor de até dois algarismos, resto e os significados de repartir igualmente e de medir.",
    bnccSkillList: ["EF04MA07"],
    prerequisiteList: ["ma4-multiplication"],
    validationRuleList: [],
  },
  {
    topicId: "ma4-inverse-operations",
    label: "Operações inversas",
    description:
      "Relação entre adição e subtração e entre multiplicação e divisão para calcular e conferir resultados.",
    bnccSkillList: ["EF04MA04", "EF04MA13"],
    prerequisiteList: ["ma4-addition-subtraction", "ma4-division"],
    validationRuleList: [],
  },
  {
    topicId: "ma4-unknown-term",
    label: "Igualdades e termo desconhecido",
    description:
      "A igualdade se mantém ao somar ou subtrair o mesmo número dos dois lados; descobrir o número que falta numa igualdade.",
    bnccSkillList: ["EF04MA14", "EF04MA15"],
    prerequisiteList: ["ma4-inverse-operations"],
    validationRuleList: [],
  },
  {
    topicId: "ma4-multiples-sequences",
    label: "Múltiplos e sequências numéricas",
    description:
      "Regularidades em sequências de múltiplos de um número e em divisões que deixam o mesmo resto.",
    bnccSkillList: ["EF04MA11", "EF04MA12"],
    prerequisiteList: ["ma4-multiplication", "ma4-division"],
    validationRuleList: [],
  },
  {
    topicId: "ma4-counting",
    label: "Problemas de contagem",
    description:
      "Contar as combinações possíveis entre elementos de duas coleções, como roupas e sabores.",
    bnccSkillList: ["EF04MA08"],
    prerequisiteList: ["ma4-multiplication"],
    validationRuleList: [],
  },
  {
    topicId: "ma4-unit-fractions",
    label: "Frações unitárias",
    description:
      "Metade, terço, quarto, quinto, décimo e centésimo como partes de um inteiro e na reta numérica.",
    bnccSkillList: ["EF04MA09"],
    prerequisiteList: ["ma4-division"],
    validationRuleList: ["rational_equivalence"],
  },
  {
    topicId: "ma4-decimals-money",
    label: "Décimos, centésimos e dinheiro",
    description: "Escrita decimal com décimos e centésimos relacionada a reais e centavos.",
    bnccSkillList: ["EF04MA10"],
    prerequisiteList: ["ma4-place-value", "ma4-unit-fractions"],
    validationRuleList: ["rational_equivalence", "measurement_unit"],
  },
  {
    topicId: "ma4-shopping",
    label: "Compras, troco e desconto",
    description: "Problemas de compra e venda, formas de pagamento, troco e desconto.",
    bnccSkillList: ["EF04MA25"],
    prerequisiteList: ["ma4-addition-subtraction", "ma4-decimals-money"],
    validationRuleList: ["measurement_unit"],
  },
  {
    topicId: "ma4-length-mass-capacity",
    label: "Comprimento, massa e capacidade",
    description:
      "Medir e estimar com metro, centímetro, quilograma, grama, litro e mililitro; conversões simples.",
    bnccSkillList: ["EF04MA20"],
    prerequisiteList: ["ma4-multiplication"],
    validationRuleList: ["measurement_unit"],
  },
  {
    topicId: "ma4-perimeter",
    label: "Perímetro",
    description: "Perímetro de figuras planas a partir das medidas dos lados.",
    bnccSkillList: ["EF04MA20"],
    prerequisiteList: ["ma4-addition-subtraction", "ma4-length-mass-capacity"],
    validationRuleList: ["measurement_unit", "figure_free_statement"],
  },
  {
    topicId: "ma4-area-units",
    label: "Área com unidades quadradas",
    description:
      "Área como número de unidades quadradas de um retângulo descrito por fileiras e colunas; figuras diferentes com a mesma área.",
    bnccSkillList: ["EF04MA21"],
    prerequisiteList: ["ma4-multiplication"],
    validationRuleList: ["measurement_unit", "figure_free_statement"],
  },
  {
    topicId: "ma4-time",
    label: "Medidas de tempo",
    description: "Horas, minutos e segundos; horário de início e de fim e duração de atividades.",
    bnccSkillList: ["EF04MA22"],
    prerequisiteList: ["ma4-addition-subtraction"],
    validationRuleList: ["measurement_unit"],
  },
  {
    topicId: "ma4-temperature",
    label: "Temperatura",
    description: "Grau Celsius, comparação de temperaturas e variação entre máxima e mínima.",
    bnccSkillList: ["EF04MA23", "EF04MA24"],
    prerequisiteList: ["ma4-addition-subtraction"],
    validationRuleList: ["measurement_unit"],
  },
  {
    topicId: "ma4-location-movement",
    label: "Localização e deslocamento",
    description:
      "Direita, esquerda, mudanças de direção e ruas paralelas e perpendiculares em trajetos descritos só em texto.",
    bnccSkillList: ["EF04MA16"],
    prerequisiteList: [],
    validationRuleList: ["figure_free_statement"],
  },
  {
    topicId: "ma4-right-angles",
    label: "Ângulos retos e não retos",
    description: "Reconhecer ângulos retos e não retos em figuras e objetos do dia a dia.",
    bnccSkillList: ["EF04MA18"],
    prerequisiteList: [],
    validationRuleList: ["figure_free_statement"],
  },
  {
    topicId: "ma4-prisms-pyramids",
    label: "Prismas e pirâmides",
    description:
      "Faces, vértices e arestas de prismas e pirâmides e os polígonos que formam suas faces.",
    bnccSkillList: ["EF04MA17"],
    prerequisiteList: [],
    validationRuleList: ["figure_free_statement"],
  },
  {
    topicId: "ma4-chance",
    label: "Chance de acontecer",
    description: "Eventos certos, impossíveis, mais prováveis e menos prováveis, sem usar frações.",
    bnccSkillList: ["EF04MA26"],
    prerequisiteList: [],
    validationRuleList: [],
  },
  {
    topicId: "ma4-tables-graphs",
    label: "Tabelas e gráficos de colunas",
    description:
      "Ler e interpretar tabelas simples e de dupla entrada e gráficos de colunas e pictóricos.",
    bnccSkillList: ["EF04MA27", "EF04MA28"],
    prerequisiteList: ["ma4-natural-numbers"],
    validationRuleList: ["figure_free_statement"],
  },
];

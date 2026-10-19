# Taxonomia de assuntos — tax-v1

> Gerado por `bun run taxonomy:doc` a partir de `packages/core/src/pedagogy/taxonomy/`. Não edite à mão: o teste do core falha se este arquivo divergir do código.

Lista canônica de assuntos por ano e disciplina (PRD §7.7). A extração mapeia as fotos do caderno para estes assuntos, o responsável confirma até três deles como chips e a geração e as validações do kit partem deles. Um id nunca muda de sentido: assunto que sai da lista fica marcado como descontinuado.

**Como revisar.** Para cada assunto, confira se ele cabe no ano, se o nome é o que a criança vê no caderno e no livro, se as habilidades correspondem ao assunto (busque o código na [BNCC oficial](https://basenacionalcomum.mec.gov.br/)), se os pré-requisitos fazem sentido e se dá para fazer 10 exercícios e 10 questões de prova sobre ele sem desenho. Falta ou sobra de assunto também conta.

## Regras aplicáveis

Marcam o que a validação automática do kit confere a mais quando o assunto está no kit; as regras gerais (contagens, cobertura, recálculo, dado pessoal) valem para todo kit.

| Regra | Disciplina | O que confere |
|---|---|---|
| `rational_equivalence` | Matemática | Frações, decimais e porcentagens: gabarito na forma simplificada, equivalentes aceitos e nenhum distrator equivalente à resposta (1/2, 2/4 e 0,5). |
| `measurement_unit` | Matemática | Medidas: resposta com unidade e conversão conferida; nenhum distrator igual à resposta em outra unidade. |
| `figure_free_statement` | Matemática | Figuras, plano e gráficos: o enunciado traz em texto ou tabela todo dado necessário; nenhuma questão pede para observar desenho. |
| `text_evidence` | Língua Portuguesa | Leitura: a resposta se apoia num trecho do texto-base original, citado no gabarito. |
| `single_normative_answer` | Língua Portuguesa | Norma-padrão: uma só resposta correta; nenhum distrator também aceito pela norma (grafia dupla, pontuação opcional). |
| `linguistic_variety_respect` | Língua Portuguesa | Variedades linguísticas: nenhuma variedade tratada como erro; adequação ao contexto formal ou informal. |

## Fora desta versão

Assuntos que dependem de figura, imagem ou oralidade não entram, porque nenhuma questão do kit pode depender de figura ausente (PRD §7.2):

- Simetria de reflexão, translação e rotação desenhada em malha
- Ampliação e redução de figuras em malha quadriculada
- Vistas, plantas baixas e croquis
- Algoritmos e fluxogramas
- Histórias em quadrinhos, tirinhas, charges, cartuns e anúncios que dependem da imagem
- Oralidade, exposição oral, declamação e produção de vídeo ou podcast
- Produção de texto avaliada como redação

## Matemática — 4º ano (22 assuntos)

| Id | Nome | Descrição | BNCC | Pré-requisitos | Regras |
|---|---|---|---|---|---|
| `ma4-natural-numbers` | Números até a dezena de milhar | Ler, escrever, comparar e ordenar números naturais até 99.999. | EF04MA01 | — | — |
| `ma4-place-value` | Valor posicional e decomposição | Unidades, dezenas, centenas e milhares; compor e decompor números com adições e multiplicações por 10, 100 e 1.000. | EF04MA02 | Números até a dezena de milhar | — |
| `ma4-addition-subtraction` | Adição e subtração | Algoritmos, cálculo mental e estimativa em problemas de juntar, acrescentar, retirar e comparar. | EF04MA03, EF04MA05 | Valor posicional e decomposição | — |
| `ma4-multiplication` | Multiplicação | Tabuada, multiplicação por números de um e dois algarismos, organização retangular e proporcionalidade. | EF04MA05, EF04MA06 | Adição e subtração | — |
| `ma4-division` | Divisão | Divisão com divisor de até dois algarismos, resto e os significados de repartir igualmente e de medir. | EF04MA07 | Multiplicação | — |
| `ma4-inverse-operations` | Operações inversas | Relação entre adição e subtração e entre multiplicação e divisão para calcular e conferir resultados. | EF04MA04, EF04MA13 | Adição e subtração; Divisão | — |
| `ma4-unknown-term` | Igualdades e termo desconhecido | A igualdade se mantém ao somar ou subtrair o mesmo número dos dois lados; descobrir o número que falta numa igualdade. | EF04MA14, EF04MA15 | Operações inversas | — |
| `ma4-multiples-sequences` | Múltiplos e sequências numéricas | Regularidades em sequências de múltiplos de um número e em divisões que deixam o mesmo resto. | EF04MA11, EF04MA12 | Multiplicação; Divisão | — |
| `ma4-counting` | Problemas de contagem | Contar as combinações possíveis entre elementos de duas coleções, como roupas e sabores. | EF04MA08 | Multiplicação | — |
| `ma4-unit-fractions` | Frações unitárias | Metade, terço, quarto, quinto, décimo e centésimo como partes de um inteiro e na reta numérica. | EF04MA09 | Divisão | `rational_equivalence` |
| `ma4-decimals-money` | Décimos, centésimos e dinheiro | Escrita decimal com décimos e centésimos relacionada a reais e centavos. | EF04MA10 | Valor posicional e decomposição; Frações unitárias | `rational_equivalence`, `measurement_unit` |
| `ma4-shopping` | Compras, troco e desconto | Problemas de compra e venda, formas de pagamento, troco e desconto. | EF04MA25 | Adição e subtração; Décimos, centésimos e dinheiro | `measurement_unit` |
| `ma4-length-mass-capacity` | Comprimento, massa e capacidade | Medir e estimar com metro, centímetro, quilograma, grama, litro e mililitro; conversões simples. | EF04MA20 | Multiplicação | `measurement_unit` |
| `ma4-perimeter` | Perímetro | Perímetro de figuras planas a partir das medidas dos lados. | EF04MA20 | Adição e subtração; Comprimento, massa e capacidade | `measurement_unit`, `figure_free_statement` |
| `ma4-area-units` | Área com unidades quadradas | Medir e comparar áreas contando quadradinhos; figuras de formatos diferentes com a mesma área. | EF04MA21 | Multiplicação | `measurement_unit`, `figure_free_statement` |
| `ma4-time` | Medidas de tempo | Horas, minutos e segundos; horário de início e de fim e duração de atividades. | EF04MA22 | Adição e subtração | `measurement_unit` |
| `ma4-temperature` | Temperatura | Grau Celsius, comparação de temperaturas e variação entre máxima e mínima. | EF04MA23, EF04MA24 | Adição e subtração | `measurement_unit` |
| `ma4-location-movement` | Localização e deslocamento | Direita, esquerda, mudanças de direção, ruas paralelas e perpendiculares em descrições de trajetos. | EF04MA16 | — | `figure_free_statement` |
| `ma4-right-angles` | Ângulos retos e não retos | Reconhecer ângulos retos e não retos em figuras e objetos do dia a dia. | EF04MA18 | — | `figure_free_statement` |
| `ma4-prisms-pyramids` | Prismas e pirâmides | Faces, vértices, arestas e planificações de prismas e pirâmides. | EF04MA17 | — | `figure_free_statement` |
| `ma4-chance` | Chance de acontecer | Eventos certos, impossíveis, mais prováveis e menos prováveis, sem usar frações. | EF04MA26 | — | — |
| `ma4-tables-graphs` | Tabelas e gráficos de colunas | Ler e interpretar tabelas simples e de dupla entrada e gráficos de colunas e pictóricos. | EF04MA27, EF04MA28 | Números até a dezena de milhar | `figure_free_statement` |

## Matemática — 5º ano (20 assuntos)

| Id | Nome | Descrição | BNCC | Pré-requisitos | Regras |
|---|---|---|---|---|---|
| `ma5-natural-numbers` | Números até a centena de milhar | Ler, escrever, comparar e ordenar números naturais até 999.999 com valor posicional. | EF05MA01 | Valor posicional e decomposição (4º ano) | — |
| `ma5-decimal-numbers` | Números decimais | Ler, escrever e decompor decimais com décimos, centésimos e milésimos e localizá-los na reta numérica. | EF05MA02 | Décimos, centésimos e dinheiro (4º ano) | `rational_equivalence` |
| `ma5-fractions` | Frações: parte do todo e divisão | Frações menores e maiores que a unidade, números mistos e fração como resultado de divisão. | EF05MA03 | Frações unitárias (4º ano) | `rational_equivalence` |
| `ma5-equivalent-fractions` | Frações equivalentes | Reconhecer e obter frações equivalentes e simplificar frações. | EF05MA04 | Frações: parte do todo e divisão | `rational_equivalence` |
| `ma5-comparing-rationals` | Comparação de frações e decimais | Comparar e ordenar frações e decimais e relacioná-los a pontos da reta numérica. | EF05MA05 | Frações equivalentes; Números decimais | `rational_equivalence` |
| `ma5-percentage` | Porcentagem | 10%, 25%, 50%, 75% e 100% como décima parte, quarta parte, metade, três quartos e inteiro. | EF05MA06 | Frações: parte do todo e divisão | `rational_equivalence` |
| `ma5-addition-subtraction` | Adição e subtração com decimais | Adição e subtração com naturais e decimais por algoritmo, cálculo mental e estimativa. | EF05MA07 | Adição e subtração (4º ano); Números decimais | `rational_equivalence` |
| `ma5-multiplication-division` | Multiplicação e divisão com decimais | Multiplicação e divisão com naturais e decimais, com multiplicador e divisor naturais. | EF05MA08 | Multiplicação (4º ano); Divisão (4º ano); Números decimais | `rational_equivalence` |
| `ma5-counting-principle` | Princípio multiplicativo | Contar possibilidades com árvore de possibilidades ou tabela. | EF05MA09 | Problemas de contagem (4º ano) | — |
| `ma5-unknown-term` | Igualdades e termo desconhecido | A igualdade se mantém ao operar os dois membros pelo mesmo número; problemas com um termo desconhecido. | EF05MA10, EF05MA11 | Igualdades e termo desconhecido (4º ano) | — |
| `ma5-direct-proportion` | Proporcionalidade | Quantidades que variam na mesma proporção: preço por unidade, receitas e escalas de mapa. | EF05MA12 | Multiplicação e divisão com decimais | `measurement_unit` |
| `ma5-unequal-sharing` | Partilha em partes desiguais | Dividir uma quantidade em duas partes em que uma é o dobro ou o triplo da outra. | EF05MA13 | Divisão (4º ano) | — |
| `ma5-coordinates` | Coordenadas no plano | Localizar pontos e descrever deslocamentos no 1º quadrante do plano cartesiano por coordenadas. | EF05MA14, EF05MA15 | Localização e deslocamento (4º ano) | `figure_free_statement` |
| `ma5-solids` | Figuras espaciais | Prismas, pirâmides, cilindros e cones: atributos e planificações. | EF05MA16 | Prismas e pirâmides (4º ano) | `figure_free_statement` |
| `ma5-polygons` | Polígonos | Reconhecer, nomear e comparar polígonos pelo número de lados, vértices e ângulos. | EF05MA17 | Ângulos retos e não retos (4º ano) | `figure_free_statement` |
| `ma5-measurement-conversions` | Medidas e conversões | Comprimento, massa, capacidade, tempo e temperatura com conversões entre as unidades usuais. | EF05MA19 | Comprimento, massa e capacidade (4º ano); Medidas de tempo (4º ano) | `measurement_unit` |
| `ma5-perimeter-area` | Perímetro e área | Perímetro e área de retângulos; figuras com o mesmo perímetro e áreas diferentes, e vice-versa. | EF05MA19, EF05MA20 | Perímetro (4º ano); Área com unidades quadradas (4º ano) | `measurement_unit`, `figure_free_statement` |
| `ma5-volume` | Volume com cubinhos | Volume como a quantidade de cubinhos que formam um bloco retangular. | EF05MA21 | Multiplicação (4º ano); Prismas e pirâmides (4º ano) | `measurement_unit`, `figure_free_statement` |
| `ma5-probability` | Probabilidade | Resultados possíveis de um experimento e probabilidade de eventos igualmente prováveis. | EF05MA22, EF05MA23 | Chance de acontecer (4º ano); Frações: parte do todo e divisão | `rational_equivalence` |
| `ma5-tables-graphs` | Tabelas e gráficos | Interpretar dados em tabelas e em gráficos de colunas e de linhas. | EF05MA24, EF05MA25 | Tabelas e gráficos de colunas (4º ano) | `figure_free_statement` |

## Matemática — 6º ano (25 assuntos)

| Id | Nome | Descrição | BNCC | Pré-requisitos | Regras |
|---|---|---|---|---|---|
| `ma6-natural-decimal-numbers` | Números naturais e decimais | Ler, escrever, comparar e ordenar naturais e decimais usando a reta numérica. | EF06MA01 | Números até a centena de milhar (5º ano); Números decimais (5º ano) | `rational_equivalence` |
| `ma6-numeral-systems` | Sistemas de numeração | Características do sistema decimal comparadas às de outros sistemas, como o romano. | EF06MA02 | Números até a centena de milhar (5º ano) | — |
| `ma6-natural-operations` | Operações com números naturais | As quatro operações com naturais por cálculo mental, escrito e estimativa. | EF06MA03 | Multiplicação e divisão com decimais (5º ano) | — |
| `ma6-powers-roots` | Potenciação e raiz quadrada | Potências de naturais, quadrados perfeitos e raiz quadrada exata, com potências de 10. | EF06MA03 | Operações com números naturais | — |
| `ma6-numeric-expressions` | Expressões numéricas | Ordem das operações em expressões com parênteses, colchetes, chaves e potências. | EF06MA03 | Operações com números naturais; Potenciação e raiz quadrada | — |
| `ma6-multiples-divisors` | Múltiplos, divisores e primos | Múltiplos, divisores, critérios de divisibilidade e números primos e compostos. | EF06MA05, EF06MA06 | Múltiplos e sequências numéricas (4º ano); Operações com números naturais | — |
| `ma6-lcm-gcd` | MMC e MDC | Decomposição em fatores primos, mínimo múltiplo comum e máximo divisor comum em problemas. | EF06MA06 | Múltiplos, divisores e primos | — |
| `ma6-fractions` | Frações: comparação e equivalência | Fração como parte e como divisão, frações equivalentes, simplificação e comparação. | EF06MA07 | Frações equivalentes (5º ano); Comparação de frações e decimais (5º ano) | `rational_equivalence` |
| `ma6-fraction-decimal` | Frações e decimais | Passar de fração para decimal e de decimal para fração e localizar na reta numérica. | EF06MA08 | Frações: comparação e equivalência; Números naturais e decimais | `rational_equivalence` |
| `ma6-fraction-of-quantity` | Fração de uma quantidade | Calcular uma fração de uma quantidade com resultado natural. | EF06MA09 | Frações: comparação e equivalência | `rational_equivalence` |
| `ma6-fraction-addition-subtraction` | Adição e subtração de frações | Somar e subtrair frações com denominadores iguais e diferentes. | EF06MA10 | Frações: comparação e equivalência; MMC e MDC | `rational_equivalence` |
| `ma6-decimal-operations` | Operações com decimais | Adição, subtração, multiplicação, divisão e potenciação com decimais; arredondamento e estimativa. | EF06MA11, EF06MA12 | Números naturais e decimais; Multiplicação e divisão com decimais (5º ano) | `rational_equivalence` |
| `ma6-percentage` | Porcentagem | Calcular porcentagens por proporcionalidade, sem regra de três, em compras e descontos. | EF06MA13 | Porcentagem (5º ano); Fração de uma quantidade | `rational_equivalence` |
| `ma6-unknown-value` | Igualdades e valor desconhecido | Usar as propriedades da igualdade para encontrar um valor desconhecido em problemas. | EF06MA14 | Igualdades e termo desconhecido (5º ano) | — |
| `ma6-sharing-ratio` | Partilha e razão | Dividir uma quantidade em partes desiguais e expressar a razão entre as partes e o todo. | EF06MA15 | Partilha em partes desiguais (5º ano); Frações: comparação e equivalência | `rational_equivalence` |
| `ma6-cartesian-plane` | Plano cartesiano | Pares ordenados e localização de pontos e de vértices de polígonos no 1º quadrante. | EF06MA16 | Coordenadas no plano (5º ano) | `figure_free_statement` |
| `ma6-prisms-pyramids` | Vértices, faces e arestas | Relação entre o número de vértices, faces e arestas de prismas e pirâmides e o polígono da base. | EF06MA17 | Figuras espaciais (5º ano) | `figure_free_statement` |
| `ma6-polygons` | Polígonos regulares | Classificar polígonos em regulares e não regulares por lados, vértices e ângulos. | EF06MA18 | Polígonos (5º ano) | `figure_free_statement` |
| `ma6-angles` | Ângulos | Ângulo como abertura; medida em graus; ângulos agudos, retos e obtusos. | EF06MA25, EF06MA26, EF06MA27 | Ângulos retos e não retos (4º ano) | `measurement_unit`, `figure_free_statement` |
| `ma6-triangles` | Classificação de triângulos | Classificar triângulos quanto às medidas dos lados e dos ângulos. | EF06MA19 | Polígonos regulares; Ângulos | `figure_free_statement` |
| `ma6-quadrilaterals` | Quadriláteros | Classificar quadriláteros por lados e ângulos: paralelogramos, retângulos, losangos, quadrados e trapézios. | EF06MA20 | Polígonos regulares | `figure_free_statement` |
| `ma6-measurement` | Grandezas e medidas | Problemas de comprimento, massa, tempo, temperatura, capacidade e volume com conversões. | EF06MA24 | Medidas e conversões (5º ano) | `measurement_unit` |
| `ma6-perimeter-area` | Perímetro e área | Perímetro e área de retângulos e triângulos sem fórmula pronta; o que muda ao dobrar os lados. | EF06MA24, EF06MA29 | Perímetro e área (5º ano) | `measurement_unit`, `figure_free_statement` |
| `ma6-probability` | Probabilidade | Probabilidade de um evento em fração, decimal e porcentagem. | EF06MA30 | Probabilidade (5º ano); Frações e decimais | `rational_equivalence` |
| `ma6-tables-graphs` | Tabelas e gráficos | Título, eixos, legenda e fonte de um gráfico e interpretação de dados em tabelas e gráficos. | EF06MA31, EF06MA32 | Tabelas e gráficos (5º ano) | `figure_free_statement` |

## Matemática — 7º ano (23 assuntos)

| Id | Nome | Descrição | BNCC | Pré-requisitos | Regras |
|---|---|---|---|---|---|
| `ma7-lcm-gcd` | Múltiplos e divisores: MMC e MDC | Problemas com múltiplos e divisores, incluindo mínimo múltiplo comum e máximo divisor comum. | EF07MA01 | MMC e MDC (6º ano) | — |
| `ma7-percentage` | Porcentagem: acréscimos e descontos | Problemas de acréscimo e desconto simples em contextos de educação financeira. | EF07MA02 | Porcentagem (6º ano) | `rational_equivalence` |
| `ma7-integers` | Números inteiros | Números negativos em temperaturas, saldos e altitudes; comparação, reta numérica, módulo e oposto. | EF07MA03 | Números naturais e decimais (6º ano) | — |
| `ma7-integer-addition-subtraction` | Adição e subtração de inteiros | Somar e subtrair números inteiros em problemas. | EF07MA03, EF07MA04 | Números inteiros | — |
| `ma7-integer-multiplication-division` | Multiplicação e divisão de inteiros | Regra de sinais na multiplicação, na divisão e na potenciação de inteiros. | EF07MA04 | Adição e subtração de inteiros | — |
| `ma7-fractions-ratio` | Frações: razão e operador | Comparar e ordenar frações como parte, divisão, razão e operador; razão como fração. | EF07MA08, EF07MA09 | Frações: comparação e equivalência (6º ano) | `rational_equivalence` |
| `ma7-rational-numbers` | Números racionais | Racionais positivos e negativos em fração e em decimal; comparação e reta numérica. | EF07MA10 | Números inteiros; Frações e decimais (6º ano) | `rational_equivalence` |
| `ma7-rational-operations` | Operações com racionais | Adição, subtração, multiplicação e divisão de frações e decimais positivos e negativos. | EF07MA11, EF07MA12 | Números racionais; Adição e subtração de frações (6º ano); Multiplicação e divisão de inteiros | `rational_equivalence` |
| `ma7-algebraic-expressions` | Expressões algébricas | Letras como variável e como incógnita; escrever expressões e calcular o seu valor numérico. | EF07MA13 | Expressões numéricas (6º ano) | — |
| `ma7-sequences` | Sequências e regularidades | Sequências recursivas e não recursivas; regularidades escritas com letras e expressões equivalentes. | EF07MA14, EF07MA15, EF07MA16 | Expressões algébricas | — |
| `ma7-linear-equations` | Equações do 1º grau | Resolver e montar problemas com equações do tipo ax + b = c. | EF07MA18 | Expressões algébricas; Igualdades e valor desconhecido (6º ano); Adição e subtração de inteiros | — |
| `ma7-proportionality` | Grandezas proporcionais | Grandezas direta e inversamente proporcionais e regra de três simples. | EF07MA17 | Proporcionalidade (5º ano); Frações: razão e operador | `measurement_unit` |
| `ma7-cartesian-symmetry` | Simetria no plano cartesiano | Simétrico de um ponto em relação aos eixos e à origem e coordenadas multiplicadas por um inteiro. | EF07MA19, EF07MA20 | Plano cartesiano (6º ano); Números inteiros | `figure_free_statement` |
| `ma7-circle` | Circunferência e o número π | Centro, raio e diâmetro; π como razão entre o comprimento e o diâmetro. | EF07MA22, EF07MA33 | Operações com decimais (6º ano) | `measurement_unit`, `figure_free_statement` |
| `ma7-parallel-lines-angles` | Ângulos e retas paralelas | Ângulos opostos pelo vértice, complementares, suplementares e os formados por paralelas e uma transversal. | EF07MA23 | Ângulos (6º ano) | `measurement_unit`, `figure_free_statement` |
| `ma7-triangles` | Triângulos: existência e ângulos | Condição de existência de um triângulo e soma dos ângulos internos igual a 180°. | EF07MA24, EF07MA25 | Classificação de triângulos (6º ano) | `measurement_unit`, `figure_free_statement` |
| `ma7-polygon-angles` | Ângulos de polígonos | Ângulos internos e externos de polígonos regulares, sem fórmula pronta. | EF07MA27 | Triângulos: existência e ângulos; Polígonos regulares (6º ano) | `measurement_unit`, `figure_free_statement` |
| `ma7-measurement` | Grandezas e medidas | Problemas com medidas em situações do cotidiano, com conversões e aproximações. | EF07MA29 | Grandezas e medidas (6º ano) | `measurement_unit` |
| `ma7-volume` | Volume de blocos retangulares | Volume em metros, decímetros e centímetros cúbicos e relação com litros. | EF07MA30 | Volume com cubinhos (5º ano); Grandezas e medidas (6º ano) | `measurement_unit`, `figure_free_statement` |
| `ma7-area` | Área de triângulos e quadriláteros | Expressões para a área de triângulos, paralelogramos e trapézios e de figuras compostas por eles. | EF07MA31, EF07MA32 | Perímetro e área (6º ano); Quadriláteros (6º ano) | `measurement_unit`, `figure_free_statement` |
| `ma7-probability` | Probabilidade e frequência | Probabilidade calculada e estimada pela frequência de resultados em experimentos repetidos. | EF07MA34 | Probabilidade (6º ano) | `rational_equivalence` |
| `ma7-mean` | Média aritmética | Calcular e interpretar a média e a amplitude de um conjunto de dados. | EF07MA35 | Operações com decimais (6º ano) | `rational_equivalence` |
| `ma7-statistics` | Pesquisa e gráfico de setores | População e amostra e interpretação de dados em tabelas e gráficos, inclusive de setores. | EF07MA36, EF07MA37 | Tabelas e gráficos (6º ano); Porcentagem (6º ano) | `figure_free_statement` |

## Língua Portuguesa — 4º ano (24 assuntos)

| Id | Nome | Descrição | BNCC | Pré-requisitos | Regras |
|---|---|---|---|---|---|
| `lp4-explicit-information` | Localizar informações no texto | Encontrar informações que estão escritas no texto. | EF15LP03 | — | `text_evidence` |
| `lp4-main-idea` | Ideia central do texto | Identificar o assunto e a ideia principal de um texto. | EF35LP03 | Localizar informações no texto | `text_evidence` |
| `lp4-inference` | Inferência | Descobrir informações que não estão escritas a partir de pistas do texto. | EF35LP04 | Localizar informações no texto | `text_evidence` |
| `lp4-word-meaning` | Sentido das palavras pelo contexto | Deduzir o sentido de palavras e expressões pelo contexto e escolher o significado certo no dicionário. | EF35LP05, EF04LP03 | — | `text_evidence` |
| `lp4-synonyms-antonyms` | Sinônimos e antônimos | Palavras de sentido parecido ou oposto e seu uso para evitar repetição no texto. | EF35LP06 | Sentido das palavras pelo contexto | `text_evidence` |
| `lp4-pronoun-reference` | Pronomes que retomam palavras | Pronomes pessoais, possessivos e demonstrativos que retomam termos e dão continuidade ao texto. | EF35LP06, EF35LP14 | — | `text_evidence` |
| `lp4-narrative-elements` | Elementos da narrativa | Personagens, tempo, lugar, narrador, conflito e desfecho em contos e fábulas. | EF35LP26, EF35LP29 | — | `text_evidence` |
| `lp4-direct-indirect-speech` | Discurso direto e indireto | Falas de personagens com travessão e dois-pontos, verbos de dizer e reconto da fala. | EF35LP22, EF35LP30 | Elementos da narrativa | `text_evidence` |
| `lp4-poems` | Poemas: versos, estrofes e rimas | Versos, estrofes, rimas e efeitos de sentido em poemas. | EF35LP23, EF35LP27 | — | `text_evidence` |
| `lp4-news` | Notícia | Manchete, fato, participantes, lugar e tempo em notícias para crianças. | EF04LP14, EF35LP16 | Localizar informações no texto | `text_evidence` |
| `lp4-fact-opinion` | Fato e opinião | Diferenciar fatos de opiniões em textos informativos, jornalísticos e publicitários. | EF04LP15 | — | `text_evidence` |
| `lp4-instructional-texts` | Textos instrucionais | Receitas, regras e instruções: lista de materiais, passos e verbos de comando. | EF04LP13 | — | `text_evidence` |
| `lp4-letters` | Carta pessoal e de reclamação | Partes da carta: local e data, saudação, corpo, despedida e assinatura. | EF04LP10 | — | `text_evidence` |
| `lp4-expository-texts` | Textos de divulgação e verbetes | Compreender textos de divulgação científica para crianças e verbetes de enciclopédia infantil. | EF04LP19, EF04LP23 | Localizar informações no texto | `text_evidence` |
| `lp4-spelling` | Ortografia | Regras de escrita como r e rr, s e ss, m antes de p e b, g e gu, c e qu. | EF04LP01 | — | `single_normative_answer` |
| `lp4-diphthongs` | Ditongos na escrita | Escrever ai, ei e ou mesmo quando a fala reduz o som, como em caixa e peixe. | EF04LP02 | — | `single_normative_answer`, `linguistic_variety_respect` |
| `lp4-syllables-stress` | Sílaba tônica | Separação silábica, sílaba tônica e palavras oxítonas, paroxítonas e proparoxítonas. | EF04LP04 | — | `single_normative_answer` |
| `lp4-accentuation` | Acentuação | Acento agudo e circunflexo; paroxítonas terminadas em i(s), l, r e ão(s). | EF04LP04 | Sílaba tônica | `single_normative_answer` |
| `lp4-punctuation` | Pontuação | Ponto final, de interrogação e de exclamação, dois-pontos, travessão e vírgula em enumerações. | EF04LP05, EF35LP07 | — | `single_normative_answer` |
| `lp4-nouns-adjectives` | Substantivo e adjetivo | Substantivos comuns e próprios, gênero e número, e adjetivos que caracterizam os substantivos. | EF04LP07 | — | `single_normative_answer` |
| `lp4-nominal-agreement` | Concordância nominal | Concordância de artigo, substantivo e adjetivo em gênero e número. | EF04LP07 | Substantivo e adjetivo | `single_normative_answer` |
| `lp4-verb-agreement` | Concordância verbal | Concordância do verbo com o substantivo ou o pronome que é o sujeito. | EF04LP06 | — | `single_normative_answer` |
| `lp4-suffixes` | Palavras com sufixos | Escrita de palavras derivadas com -agem, -oso, -eza, -izar e -isar. | EF04LP08 | Ortografia | `single_normative_answer` |
| `lp4-linguistic-variety` | Variedades linguísticas | Diferentes jeitos de falar pelo Brasil e respeito às variedades regionais e sociais. | EF35LP11 | — | `linguistic_variety_respect`, `text_evidence` |

## Língua Portuguesa — 5º ano (23 assuntos)

| Id | Nome | Descrição | BNCC | Pré-requisitos | Regras |
|---|---|---|---|---|---|
| `lp5-explicit-information` | Localizar informações no texto | Encontrar informações escritas em textos mais longos e de gêneros variados. | EF15LP03 | Localizar informações no texto (4º ano) | `text_evidence` |
| `lp5-main-idea` | Ideia central do texto | Identificar o assunto e a ideia principal e resumir um texto. | EF35LP03 | Ideia central do texto (4º ano) | `text_evidence` |
| `lp5-inference-humor` | Inferência e humor | Informações implícitas e o que provoca o humor em anedotas e piadas. | EF35LP04, EF05LP10 | Inferência (4º ano) | `text_evidence` |
| `lp5-word-meaning` | Sentido das palavras e polissemia | Sentido de palavras pelo contexto e palavras com mais de um significado. | EF35LP05, EF05LP02 | Sentido das palavras pelo contexto (4º ano) | `text_evidence` |
| `lp5-dictionary` | Verbete de dicionário | Estrutura do verbete, abreviaturas e escolha do significado adequado ao contexto. | EF05LP22 | Sentido das palavras pelo contexto (4º ano) | `text_evidence` |
| `lp5-text-cohesion` | Retomadas no texto | Pronomes e sinônimos que retomam termos já citados e dão continuidade ao texto. | EF35LP06, EF05LP27 | Pronomes que retomam palavras (4º ano) | `text_evidence` |
| `lp5-conjunctions` | Conjunções e relações de sentido | Conjunções que indicam adição, oposição, tempo, causa, condição e finalidade. | EF05LP07 | — | `text_evidence` |
| `lp5-narrative` | Narrativa e narrador | Enredo, personagens, tempo, espaço e narrador em 1ª e 3ª pessoa em contos e lendas. | EF35LP26, EF35LP29 | Elementos da narrativa (4º ano) | `text_evidence` |
| `lp5-direct-indirect-speech` | Discurso direto e indireto | Diferenciar discurso direto e indireto e o efeito dos verbos de dizer. | EF35LP30 | Discurso direto e indireto (4º ano) | `text_evidence` |
| `lp5-poems` | Poemas e linguagem figurada | Rimas, ritmo, sentido figurado e metáforas em poemas. | EF35LP27, EF35LP31 | Poemas: versos, estrofes e rimas (4º ano) | `text_evidence` |
| `lp5-drama` | Texto teatral | Falas das personagens, cenas e rubricas em textos escritos para serem encenados. | EF35LP24 | — | `text_evidence` |
| `lp5-news-reports` | Notícia e reportagem | Compreender notícias e reportagens e comparar como diferentes fontes contam o mesmo fato. | EF05LP15, EF05LP16 | Notícia (4º ano) | `text_evidence` |
| `lp5-opinion-arguments` | Opinião e argumentos | Identificar a opinião do autor, os argumentos que a sustentam e a força de cada um. | EF05LP20, EF35LP15 | Fato e opinião (4º ano) | `text_evidence` |
| `lp5-game-rules` | Regras de jogo e instruções | Organização de textos de regras de jogo: objetivo, materiais, passos e condições. | EF05LP09 | Textos instrucionais (4º ano) | `text_evidence` |
| `lp5-spelling` | Ortografia | Regras contextuais e morfológicas e palavras de uso frequente com grafia irregular. | EF05LP01 | Ortografia (4º ano) | `single_normative_answer` |
| `lp5-accentuation` | Acentuação | Acentuar corretamente palavras oxítonas, paroxítonas e proparoxítonas. | EF05LP03 | Acentuação (4º ano) | `single_normative_answer` |
| `lp5-punctuation` | Pontuação e efeitos de sentido | Vírgula, ponto e vírgula e dois-pontos; efeitos de reticências, aspas e parênteses. | EF05LP04 | Pontuação (4º ano) | `single_normative_answer`, `text_evidence` |
| `lp5-verb-tenses` | Tempos verbais | Presente, passado e futuro no modo indicativo. | EF05LP05 | — | `single_normative_answer` |
| `lp5-verb-agreement` | Concordância verbal | Flexionar o verbo de acordo com o sujeito, na escrita e na fala. | EF05LP06 | Concordância verbal (4º ano); Tempos verbais | `single_normative_answer` |
| `lp5-nominal-agreement` | Concordância nominal | Concordância entre substantivo, artigo, adjetivo e numeral ao produzir textos. | EF05LP26 | Concordância nominal (4º ano) | `single_normative_answer` |
| `lp5-pronouns` | Pronomes | Pronomes pessoais, possessivos e demonstrativos e seu uso nas frases. | EF35LP14 | Pronomes que retomam palavras (4º ano) | `single_normative_answer` |
| `lp5-word-formation` | Primitivas, derivadas e compostas | Palavras primitivas, derivadas por prefixo ou sufixo e compostas. | EF05LP08 | Palavras com sufixos (4º ano) | `single_normative_answer` |
| `lp5-linguistic-variety` | Variedades linguísticas | Variedades regionais e sociais da língua e respeito a quem fala de outro jeito. | EF35LP11 | Variedades linguísticas (4º ano) | `linguistic_variety_respect`, `text_evidence` |

## Língua Portuguesa — 6º ano (22 assuntos)

| Id | Nome | Descrição | BNCC | Pré-requisitos | Regras |
|---|---|---|---|---|---|
| `lp6-reading-comprehension` | Compreensão de texto | Localizar informações, identificar o tema e relacionar partes de textos variados. | EF67LP28 | Localizar informações no texto (5º ano); Ideia central do texto (5º ano) | `text_evidence` |
| `lp6-inference` | Inferência, humor e ironia | Sentidos implícitos e efeitos de humor e ironia criados pelo uso das palavras. | EF69LP05 | Inferência e humor (5º ano) | `text_evidence` |
| `lp6-word-meaning` | Sinônimos e sentido das palavras | Diferenças de sentido entre sinônimos e escolha da palavra adequada ao contexto. | EF06LP03 | Sentido das palavras e polissemia (5º ano) | `text_evidence` |
| `lp6-text-cohesion` | Coesão: retomadas no texto | Pronomes, sinônimos e expressões que retomam termos e evitam repetição. | EF06LP12, EF67LP36 | Retomadas no texto (5º ano) | `text_evidence` |
| `lp6-news` | Notícia | Manchete, lide, fato central e circunstâncias; escolhas do autor que tornam o relato parcial. | EF69LP03, EF69LP16, EF06LP01 | Notícia e reportagem (5º ano) | `text_evidence` |
| `lp6-fact-opinion` | Fato e opinião | Distinguir o fato da opinião sobre ele em trechos de textos jornalísticos. | EF67LP04 | Opinião e argumentos (5º ano) | `text_evidence` |
| `lp6-opinion-texts` | Textos de opinião | Tese, argumentos e recursos de persuasão em cartas de leitor, comentários e resenhas. | EF67LP05, EF67LP07 | Fato e opinião | `text_evidence` |
| `lp6-narrative` | Narrativa e foco narrativo | Enredo, personagens, tempo, espaço, narrador e foco narrativo em contos, lendas e mitos. | EF69LP47, EF67LP28 | Narrativa e narrador (5º ano) | `text_evidence` |
| `lp6-direct-indirect-speech` | Discurso direto e indireto | Vozes do narrador e das personagens e passagem do discurso direto para o indireto. | EF06LP12, EF69LP47 | Discurso direto e indireto (5º ano) | `text_evidence` |
| `lp6-poems` | Poemas e recursos expressivos | Estrofes, rimas, ritmo, aliterações e linguagem figurada em poemas. | EF69LP48 | Poemas e linguagem figurada (5º ano) | `text_evidence` |
| `lp6-figures-of-speech` | Figuras de linguagem | Comparação, metáfora, personificação, hipérbole e onomatopeia e seus efeitos. | EF67LP38 | Poemas e linguagem figurada (5º ano) | `text_evidence` |
| `lp6-nouns` | Substantivo | Classificação dos substantivos e flexão de gênero, número e grau. | EF06LP04 | Substantivo e adjetivo (4º ano) | `single_normative_answer` |
| `lp6-adjectives` | Adjetivo e locução adjetiva | Função e flexão dos adjetivos, graus comparativo e superlativo e locuções adjetivas. | EF06LP04 | Substantivo | `single_normative_answer` |
| `lp6-pronouns` | Pronomes | Pronomes pessoais retos e oblíquos, possessivos e demonstrativos e seu papel na coesão. | EF06LP12 | Pronomes (5º ano) | `single_normative_answer` |
| `lp6-verb-moods` | Verbos: tempos e modos | Flexão nos modos indicativo, subjuntivo e imperativo e o efeito de sentido de cada modo. | EF06LP04, EF06LP05 | Tempos verbais (5º ano) | `single_normative_answer` |
| `lp6-agreement` | Concordância nominal e verbal | Concordância do substantivo com seus determinantes e do verbo com o sujeito simples ou composto. | EF06LP06 | Concordância verbal (5º ano); Concordância nominal (5º ano) | `single_normative_answer` |
| `lp6-sentence-clause` | Frase, oração e período | Oração organizada em torno de um verbo; período simples e período composto. | EF06LP07, EF06LP08, EF06LP09 | Verbos: tempos e modos | `single_normative_answer` |
| `lp6-spelling` | Ortografia | Escrita correta de palavras com dúvidas frequentes, como s, z, x, ch, g e j. | EF67LP32 | Ortografia (5º ano) | `single_normative_answer` |
| `lp6-accentuation` | Acentuação gráfica | Regras de acentuação de oxítonas, paroxítonas, proparoxítonas e monossílabos tônicos. | EF67LP32 | Acentuação (5º ano) | `single_normative_answer` |
| `lp6-punctuation` | Pontuação | Pontuação de frases e de diálogos e os efeitos de sentido da pontuação. | EF67LP33 | Pontuação e efeitos de sentido (5º ano) | `single_normative_answer`, `text_evidence` |
| `lp6-word-formation` | Formação de palavras | Derivação por prefixo e sufixo, composição e antônimos formados com prefixos de negação. | EF67LP34, EF67LP35 | Primitivas, derivadas e compostas (5º ano) | `single_normative_answer` |
| `lp6-linguistic-variety` | Variedades linguísticas e norma | Variedades da língua, norma-padrão, preconceito linguístico e adequação ao contexto. | EF69LP55, EF69LP56 | Variedades linguísticas (5º ano) | `linguistic_variety_respect`, `text_evidence` |

## Língua Portuguesa — 7º ano (20 assuntos)

| Id | Nome | Descrição | BNCC | Pré-requisitos | Regras |
|---|---|---|---|---|---|
| `lp7-reading-comprehension` | Compreensão de texto | Tema, informações principais e relações entre as partes de textos variados. | EF67LP28 | Compreensão de texto (6º ano) | `text_evidence` |
| `lp7-inference` | Inferência, humor e ironia | Sentidos implícitos, ambiguidade, humor e ironia em textos curtos. | EF69LP05 | Inferência, humor e ironia (6º ano) | `text_evidence` |
| `lp7-text-cohesion` | Coesão referencial | Substituições por sinônimos e pronomes que ligam as partes do texto e evitam repetição. | EF07LP12, EF07LP13 | Coesão: retomadas no texto (6º ano) | `text_evidence` |
| `lp7-news-reports` | Notícia e reportagem | Comparar notícias e reportagens sobre o mesmo fato, sensacionalismo e confiabilidade. | EF07LP01, EF07LP02, EF67LP03 | Notícia (6º ano) | `text_evidence` |
| `lp7-argumentation` | Argumentação e persuasão | Tese, tipos de argumento, recursos persuasivos e marcas de opinião em textos argumentativos. | EF67LP05, EF67LP07, EF07LP14 | Textos de opinião (6º ano) | `text_evidence` |
| `lp7-narrative` | Narrativa: foco, tempo e espaço | Foco narrativo, tempo cronológico e psicológico, espaço e caracterização das personagens. | EF69LP47 | Narrativa e foco narrativo (6º ano) | `text_evidence` |
| `lp7-drama` | Texto dramático | Personagem, ato, cena, fala, rubricas e conflito em textos teatrais. | EF67LP29 | Texto teatral (5º ano) | `text_evidence` |
| `lp7-poems` | Poemas e recursos expressivos | Recursos sonoros, semânticos e de forma em poemas de verso livre e de forma fixa. | EF69LP48 | Poemas e recursos expressivos (6º ano) | `text_evidence` |
| `lp7-figures-of-speech` | Figuras de linguagem | Metáfora, comparação, metonímia, personificação, hipérbole, ironia e antítese e seus efeitos. | EF67LP38, EF69LP54 | Figuras de linguagem (6º ano) | `text_evidence` |
| `lp7-subject-predicate` | Sujeito e predicado | Verbo como núcleo da oração; identificar sujeito e predicado e tipos de sujeito. | EF07LP04, EF07LP07 | Frase, oração e período (6º ano) | `single_normative_answer` |
| `lp7-verb-transitivity` | Transitividade verbal | Verbos intransitivos e transitivos diretos e indiretos; objeto direto e objeto indireto. | EF07LP05, EF07LP07 | Sujeito e predicado | `single_normative_answer` |
| `lp7-adjective-modifiers` | Adjetivos na oração | Adjetivos e locuções adjetivas que ampliam o sentido do sujeito ou do complemento. | EF07LP08 | Adjetivo e locução adjetiva (6º ano); Sujeito e predicado | `single_normative_answer` |
| `lp7-adverbs` | Advérbio e locução adverbial | Advérbios e locuções adverbiais de tempo, lugar, modo, intensidade e negação. | EF07LP09 | Verbos: tempos e modos (6º ano) | `single_normative_answer` |
| `lp7-verb-moods` | Modos e tempos verbais | Uso dos modos e tempos verbais na produção de textos. | EF07LP10 | Verbos: tempos e modos (6º ano) | `single_normative_answer` |
| `lp7-agreement` | Concordância nominal e verbal | Regras básicas de concordância nominal e verbal em frases e textos. | EF07LP06 | Concordância nominal e verbal (6º ano) | `single_normative_answer` |
| `lp7-compound-sentences` | Período composto: adição e oposição | Orações ligadas por vírgula ou pelas conjunções e, mas e porém, com sentido de soma ou oposição. | EF07LP11 | Frase, oração e período (6º ano) | `single_normative_answer` |
| `lp7-word-formation` | Prefixos e sufixos | Formar palavras derivadas com os prefixos e sufixos mais usados no português. | EF07LP03 | Formação de palavras (6º ano) | `single_normative_answer` |
| `lp7-spelling-accentuation` | Ortografia e acentuação | Grafia de palavras com dúvidas frequentes e regras de acentuação gráfica. | EF67LP32 | Ortografia (6º ano); Acentuação gráfica (6º ano) | `single_normative_answer` |
| `lp7-punctuation` | Pontuação | Uso da vírgula, do ponto e vírgula e dos dois-pontos e seus efeitos de sentido. | EF67LP33 | Pontuação (6º ano) | `single_normative_answer`, `text_evidence` |
| `lp7-linguistic-variety` | Variedades linguísticas e norma | Variedades da língua, norma-padrão e preconceito linguístico; formal e informal conforme a situação. | EF69LP55, EF69LP56 | Variedades linguísticas e norma (6º ano) | `linguistic_variety_respect`, `text_evidence` |

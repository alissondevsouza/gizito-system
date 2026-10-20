# Spec pedagógica executável — v1.0

> Contrato que as features F1-03 a F1-08 e F1-10 implementam, a partir do PRD 1.3 §6–7, do design doc 1.5 §5.2, §6.3 e §9 e de `docs/engineering/jobs.md` §2. Prompts v1 em [`prompts-v1.md`](prompts-v1.md); assuntos e assuntos ainda não atendidos em [`taxonomia.md`](taxonomia.md), gerado do core.
>
> **Estado:** aguardando a aprovação do humano (pronto da F1-02); os pontos que pedem decisão dele estão no §15. Números marcados *nova* são constantes que a F1-03 cria no core com o valor proposto aqui; a regressão da F1-10 calibra e muda o valor no core, nunca no texto dos prompts. Decisões de arquitetura do pipeline: ADR-0010.

Leia a seção que a sua feature toca (§14 diz qual).

## 1. Pipeline

| # | Etapa | Quando | Modelo | Entra | Sai | Depois, sem IA | Implementa |
|---|---|---|---|---|---|---|---|
| 1 | `extract` | `order.analyze`, antes do Pix, **uma chamada por foto** | `AI_MODEL_EXTRACT` | 1 foto normalizada, ano, disciplina, assuntos do ano × disciplina, não atendidos da disciplina | `photoExtractionSchema` (§3.1) | `mergePhotoExtractionList` e `decidePreviewOutcome` (§3.3) | F1-06; schemas e funções na F1-03 |
| 2 | confirmação | API, `POST /orders/:token/confirm` | — | escolha do responsável | `topicIdList`, `otherTopicText`, opcionais | `isSelectableTopic`, `findUnsupportedTopicList` (§4) | F2-03 |
| 3 | alocação | `order.generate`, início | — | assuntos na ordem, dificuldade percebida | `kitSlotPlan` (§5) | `planKitSlots` | F1-03 |
| 4 | `plan` | `order.generate` | `AI_MODEL_GENERATE` | vagas, assuntos, perfil, observação, "outro" | `kitPlanSchema` (§6) | `validateKitPlan` | F1-07; schema e validação na F1-03 |
| 5 | `generate` | `order.generate` | `AI_MODEL_GENERATE` | plano, vagas, assuntos, perfil | `kitContentSchema` (§7.1) | `composeStudyKit` → `studyKitSchema` (§7.2) | F1-07; schemas na F1-03 |
| 6 | validação | `order.generate` | — | `studyKit` | `ValidationIssue[]` (§8) | `validateStudyKit` (core, com `MathEvaluator`) e `checkMathMarkup` (worker, KaTeX) | F1-03, F1-04, F1-07 |
| 7 | `review` | `order.generate` | `AI_MODEL_GENERATE` | kit em duas folhas: questões e gabarito | `reviewResultSchema` (§9) | `interpretReview` | F1-07; schema e interpretação na F1-03 |
| 8 | render | `order.generate` | — | `studyKit` | dois PDFs, contagem de páginas, presença dos itens | conferência do DOM | F1-08 |
| 9 | publicação | `order.generate` | — | PDFs no storage, `studyKit` | `publishKit` | — | F2-05 |

**Regras que valem para todas as etapas**

- **Fotos só na extração.** `plan`, `generate` e `review` nunca recebem foto nem texto do material, só ids da taxonomia, o perfil estruturado e os dados do pedido. Garante originalidade (PRD §7.1.5), impede dado pessoal da foto no kit e corta custo.
- **O código decide o que é regra; o modelo escreve conteúdo.** Distribuição de assuntos e dificuldades, contagens, ordem das questões e severidade de cada problema são calculadas no core. O modelo nunca escolhe quantas questões, de que assunto ou com que dificuldade.
- **Toda saída de IA passa pelo Zod** do schema da etapa, com os refinamentos; saída inválida é falha da etapa, nunca parse tolerante. O JSON Schema enviado ao modelo é gerado do mesmo schema (`z.toJSONSchema`), na versão da disciplina do pedido.
- **Dado não confiável** (foto, observação, "outro", perfil vindo das fotos) entra na mensagem do usuário em bloco delimitado, com `<` e `>` removidos antes da interpolação para não fechar o bloco, e com a instrução de não seguir ordens contidas nele.
- **`generationVersion`** = versões dos quatro prompts usados, unidas por `+`: `extract-v1+plan-v1+generate-v1+review-v1`. Vai no kit; cada `ai_call` grava em `prompt_version` só a versão da própria etapa (`generate-v1`).
- **Métricas, custos e casos** são indexados por `topicRef`; kits com "outro" (`other`) entram agregados à parte (PRD §7.7).
- **Logs** levam etapa, códigos, tokens, custo e duração; nunca evidência, perfil, nota da revisão ou conteúdo do kit (invariante 9).

## 2. Tipos comuns

| Tipo | Definição |
|---|---|
| `topicRef` | `TopicId` da taxonomia ou `"other"` (`OTHER_TOPIC_REF`, *nova*), que representa o assunto "outro". Nenhum id da taxonomia é `other` (todos têm prefixo `ma4-`…`lp7-`) |
| `itemId` | `p1`–`p10` (fixação), `m1`–`m10` (simulado), `e1`, `e2` (exemplos), `t1`–`t3` (textos-base) |
| `kitText` | texto pt-BR; no Zod, só aparado e com tamanho. Conteúdo proibido (Markdown, HTML, emoji, link, dado pessoal, termo bloqueado) é conferido pelos códigos do §8.3, para ter código próprio e reparo por item. Marcação matemática em `\(` … `\)` (abaixo) |
| `kitTable` | `{ headerList: string[2..6], rowList: string[][1..10] }`; cada linha com o mesmo número de células do cabeçalho; célula de 1 a 40 caracteres. Substitui figura e gráfico nos assuntos com `figure_free_statement` |
| `expectedAnswer` | `expectedAnswerSchema` existente (`number`, `fraction`, `expression`, `set`, `text`), com as regras de uso do §7.1 |
| `ValidationIssue` | `{ code, severity: "blocker" \| "warning", stage: "extract" \| "plan" \| "validate" \| "review" \| "render", itemId: itemId \| topicRef \| null, note: string \| null, excerpt: string \| null }`; `note` só vem da revisão (até 200 caracteres); `excerpt` só vem de código determinístico de texto: o trecho do kit que casou, até 80 caracteres. Os dois são texto do kit, nunca entram em log |

**Marcação matemática.** Expressão que precisa de formatação vai entre `\(` e `\)`, com o subconjunto do KaTeX: `\frac{a}{b}`, `^{}`, `\times`, `\div`, `\cdot`, `\text{}`, `\le`, `\ge`, `\ne`, `\%`. O cifrão é literal ("R$ 12,50" fica fora da marcação): por isso não se usa `$` como delimitador. Números em pt-BR em todo o texto, inclusive dentro da marcação: vírgula decimal (`2,5`) e ponto de milhar (`1.250`); o render (F1-08) troca a vírgula decimal por `{,}` dentro da marcação para o KaTeX não espaçar. `checkMathMarkup` (worker) confere delimitadores pareados e o parse do KaTeX de cada trecho.

## 3. Extração (antes do Pix)

Uma chamada por foto: o resultado de cada foto fica em cache e "Trocar foto" só paga a foto nova. A chave do cache é o `content_hash` da foto normalizada com ano, disciplina, `TAXONOMY_VERSION`, versão do prompt e modelo (a lista de assuntos oferecida muda com eles). Onde o cache e o resultado ficam no banco é decisão da F2-02, com uma regra fixa: o cache guarda texto derivado da foto (evidência, perfil) e expira junto com ela, em `PHOTO_RETENTION_DAYS`, mesmo quando outro pedido reaproveitou o resultado.

### 3.1 `photoExtractionSchema` (saída do modelo, por foto)

| Campo | Tipo | Regra |
|---|---|---|
| `legibility` | `good` \| `partial` \| `unreadable` | `partial`: parte ilegível, assunto reconhecível em algum trecho |
| `isSchoolMaterial` | boolean | `false` para foto que não é material escolar; outra disciplina é `true` com aviso |
| `photoIssueList` | enum[] sem repetição | `blurry`, `dark`, `glare`, `cropped`, `tilted`, `small_text`, `hard_handwriting` |
| `topicCandidateList` | 0 a `MAX_TOPIC_CANDIDATE_COUNT` (*nova*, 6), sem `topicId` repetido, ordem de relevância | `{ topicId: taxonomyTopicIdSchema, confidence: "high" \| "medium", evidence: string 10..MAX_EVIDENCE_LENGTH }` (*nova*, 120) |
| `unsupportedTopicIdList` | `unsupportedTopicIdSchema`[] sem repetição | áreas ainda não atendidas de que a foto trata |
| `materialProfile` | `materialProfileSchema` (§3.2) | — |
| `sourceWarningCodeList` | enum[] sem repetição | `personal_data_visible`, `subject_mismatch`, `grade_mismatch`, `figure_dependent_content`, `instruction_in_material` |

Sem refinamento entre campos: o que o modelo devolver fora da regra (candidato ou não atendido em foto não utilizável, notação em Língua Portuguesa) é descartado na junção (§3.3) e nunca torna a saída inválida. Nenhum campo copia o dado pessoal que gerou `personal_data_visible`: o prompt proíbe e a junção descarta o que casar com os padrões do §8.4. `photoIssueList` serve à prévia, para dizer por que trocar a foto (F2-09), e às métricas.

### 3.2 `materialProfileSchema`

| Campo | Tipo | Regra |
|---|---|---|
| `exerciseFormatList` | enum[] sem repetição | `multiple_choice`, `fill_in_blank`, `computation`, `word_problem`, `true_false`, `matching`, `open_answer`, `text_comprehension`, `table_or_chart` |
| `notationList` | enum[] sem repetição; ignorada em Língua Portuguesa (a junção esvazia) | `fraction_slash` (a/b na linha), `fraction_stacked`, `mixed_number`, `decimal_comma`, `multiplication_x`, `multiplication_dot`, `division_obelus` (÷), `division_bracket` (método da chave), `percent_sign`, `power_superscript` |
| `terminologyList` | string[] 0..`MAX_TERMINOLOGY_COUNT` (*nova*, 10), cada uma 2..`MAX_TERM_LENGTH` (*nova*, 40), sem repetição | termos técnicos da disciplina usados pela turma ("numeral misto") |
| `contextThemeList` | string[] 0..`MAX_CONTEXT_THEME_COUNT` (*nova*, 5), cada uma 2..40 | temas genéricos dos problemas e textos ("compras no mercado") |
| `apparentLevel` | `below_grade` \| `at_grade` \| `above_grade` | em relação ao ano do pedido |
| `hasFigures` | boolean | o material usa desenho, figura, gráfico ou malha |
| `isHandwritten` | boolean | a maior parte foi escrita à mão |

`mixed_number` orienta só o estilo: resposta em número misto vai no gabarito estruturado como `fraction` imprópria, e a explicação mostra a forma mista.

O bloco "O que entendi do material" da prévia (design doc §6.3) é montado na F2-09 a partir de mapas de rótulo pt-BR do core (`exerciseFormatLabelMap`, `notationLabelMap`, F1-03) e de `isHandwritten`: por exemplo `word_problem` → "problemas do dia a dia", `fraction_slash` → "frações escritas como a/b", `isHandwritten` → "texto manuscrito". `terminologyList` e `contextThemeList` nunca aparecem na tela: vão só para o `plan`, como dado.

### 3.3 Junção, sanitização e decisão da prévia (core)

`mergePhotoExtractionList(photoExtractionList, { grade, subject })`:

1. **Descartar** candidato cujo `topicId` não passa em `isSelectableTopic(topicId, grade, subject)` (aviso interno `extraction_unknown_topic`), id não atendido que não existe ou é de outra disciplina (`extraction_unknown_unsupported_topic`) e item de `evidence`, `terminologyList` ou `contextThemeList` que casa com os padrões de dado pessoal do §8.4 (`extraction_personal_data_dropped`). Esses avisos são métricas; o responsável não os vê.
2. **Foto utilizável** = `legibility` diferente de `unreadable` e `isSchoolMaterial`. Foto não utilizável não contribui com candidato, não atendido nem perfil.
3. **Candidatos:** união por `topicId`; `confidence` `high` se alguma foto deu `high`; `photoIndexList` com as fotos (1 a N) em que aparece. Ordem: mais fotos, depois `high` antes de `medium`, depois a primeira foto em que aparece, depois a ordem de `listTopics`. Corte em `MAX_TOPIC_CANDIDATE_COUNT`.
4. **Não atendidos e avisos:** união, cada um com `photoIndexList`.
5. **Perfil:** listas unidas na ordem da primeira aparição, sem repetição (sem diferença de maiúsculas), cortadas nos limites; `apparentLevel` é o mais frequente entre as fotos utilizáveis (empate → `at_grade`); `hasFigures` e `isHandwritten` são verdadeiros se alguma foto utilizável for; em Língua Portuguesa, `notationList` fica vazia.
6. **`legibility_score`** de cada `order_photo`: `LEGIBILITY_SCORE_MAP` (*nova*): `good` 1, `partial` 0,5, `unreadable` 0.

`decidePreviewOutcome(mergedExtraction)`:

| Situação | Resultado | Código | Texto (design doc §5.2) |
|---|---|---|---|
| nenhuma foto utilizável | `analysis_failed` → `draft` | `photos_unreadable` | "Foto ilegível" + "Trocar foto" |
| ao menos 1 candidato | `analysis_succeeded` → `preview_ready` | — | "Assuntos detectados"; foto não utilizável sinalizada; não atendidos à parte |
| nenhum candidato e ao menos 1 não atendido | `analysis_failed` → `draft` | `only_unsupported_topics` | "Nenhum assunto atendido" |
| nenhum candidato e nenhum não atendido | `analysis_failed` → `draft` | `no_topic_found` | "Foto ilegível" + "Trocar foto"; com `subject_mismatch` ou `grade_mismatch`, texto próprio a decidir (§15) |

Saída de modelo inválida numa foto: uma nova chamada para a mesma foto; persistindo, a foto conta como não utilizável, com o aviso interno `extraction_output_invalid`, e o responsável vê para ela o texto de foto ilegível (trocar a foto costuma resolver). É falha definitiva da foto e não volta à fila. Erro de rede, 5xx e limite de taxa do provedor são transitórios e seguem o retry do job `order.analyze` (`jobs.md` §1).

**Sugestão para a F2-09:** chips pré-marcados = candidatos `high`, na ordem, até `MAX_TOPIC_COUNT`; os `medium` aparecem desmarcados.

## 4. Confirmação (F2-03)

- `topicIdList`: ids que passam em `isSelectableTopic` para o ano e a disciplina do pedido; o total com o "outro" fica entre `MIN_TOPIC_COUNT` e `MAX_TOPIC_COUNT` (`countOrderTopics`). Id não atendido nunca é selecionável (não é id da taxonomia). Recusa: `topic_not_selectable`.
- `otherTopicText` (até `MAX_OTHER_TOPIC_LENGTH`): se `findUnsupportedTopicList(otherTopicText, subject)` não for vazia, recusa com `other_topic_unsupported`, devolvendo o rótulo da área para o texto "Assunto ainda não atendido" do design doc §5.2. As palavras e a regra de casamento estão em `taxonomia.md`.
- **Ordem = relevância.** A ordem de `topicIdList` é a ordem da prévia (relevância da extração, §3.3); assunto marcado à mão vai depois dos detectados; o "outro" é sempre o último. A alocação do §5 usa essa ordem.

## 5. Alocação das questões (core, `planKitSlots`)

Entrada: `topicRefList` (1 a 3, na ordem do §4) e `perceivedDifficulty`. Saída `kitSlotPlan`:

| Campo | Conteúdo |
|---|---|
| `practiceSlotList` | 10 vagas `{ slotId: "p1".."p10", block: "practice", topicRef, difficulty }` |
| `mockSlotList` | 10 vagas `{ slotId: "m1".."m10", block: "mock", topicRef, difficulty }` |
| `workedExampleSlotList` | `[{ exampleId: "e1", topicRef: 1º assunto }, { exampleId: "e2", topicRef: 2º assunto, ou o 1º se houver um só }]` |
| `reviewSectionTopicRefList` | os assuntos, na ordem: uma seção de revisão por assunto |

Algoritmo, por bloco:

1. **Dificuldades do bloco:** `PRACTICE_DIFFICULTY_DISTRIBUTION` (4/4/2) e `MOCK_DIFFICULTY_DISTRIBUTION` (3/4/3), deslocadas pela direção de `PERCEIVED_DIFFICULTY_SHIFT_DIRECTION_MAP` (*nova*): `basic` → +1, `intermediate` → −1, `unknown` ou ausente → 0. O bloco ganha `direção × MAX_PERCEIVED_DIFFICULTY_SHIFT` fáceis e perde o mesmo número de intermediárias (proposta para aprovação, §15).
2. **Questões por assunto:** cada assunto recebe `MIN_QUESTION_COUNT_PER_TOPIC_PER_BLOCK[n]`; as que sobram vão uma a uma aos assuntos na ordem, recomeçando do primeiro. Com 3 assuntos: 4/3/3; com 2: 5/5; com 1: 10.
3. **Assentos:** percorrer os assuntos em rodízio, pulando quem já completou a sua quantidade, até 10 assentos.
4. **Dificuldade por assento:** as dificuldades do bloco ordenadas (fáceis, intermediárias, desafiadoras) são dadas aos assentos na ordem.
5. **Ordem final:** no simulado, a ordem dos assentos (assuntos misturados, dificuldade crescente: PRD §7.2 "ordem não agrupada"); na fixação, agrupada por assunto na ordem dos assuntos e, dentro do assunto, da fácil para a desafiadora.

Resultado esperado (teste de referência da F1-03), 3 assuntos A, B, C, sem dificuldade percebida:

| Bloco | Vagas |
|---|---|
| Fixação | p1 A fácil · p2 A fácil · p3 A intermediária · p4 A desafiadora · p5 B fácil · p6 B intermediária · p7 B intermediária · p8 C fácil · p9 C intermediária · p10 C desafiadora |
| Simulado | m1 A fácil · m2 B fácil · m3 C fácil · m4 A intermediária · m5 B intermediária · m6 C intermediária · m7 A intermediária · m8 B desafiadora · m9 C desafiadora · m10 A desafiadora |

Com 2 assuntos A e B: fixação A fácil, fácil, intermediária, intermediária, desafiadora e B igual; simulado m1 A fácil, m2 B fácil, m3 A fácil, m4 B intermediária, m5 A intermediária, m6 B intermediária, m7 A intermediária, m8 B desafiadora, m9 A desafiadora, m10 B desafiadora.

## 6. Plano (`kitPlanSchema`, saída do `plan`)

| Campo | Tipo | Regra |
|---|---|---|
| `topicObjectiveList` | um por assunto, na ordem | `{ topicRef, objectiveList: string[1..3] }`, cada objetivo 10..140 |
| `slotDetailList` | 20, na ordem das vagas | `{ slotId, questionType: "multiple_choice" \| "open_answer", isContextualized: boolean, skillFocus: string 10..140, baseTextId: "t1".."t3" \| null }` |
| `workedExampleFocusList` | 2 | `{ exampleId: "e1" \| "e2", focus: string 10..140 }` |
| `baseTextBriefList` | Português: 1..3; Matemática: vazia | `{ baseTextId, block: "practice" \| "mock", genre: string 3..40, theme: string 3..80 }` |
| `styleGuideList` | string[0..5], cada uma 10..140 | diretrizes de estilo tiradas do perfil |
| `prerequisiteReminderList` | string[0..3], cada uma 10..140 | pré-requisitos a relembrar na revisão |
| `otherTopicAssessment` | `null` sem "outro"; objeto com "outro" | `{ verdict: "feasible" \| "unfeasible", label: string 3..40, reasonCode: "figure" \| "orality" \| "open_writing" \| "beyond_grade" \| "other_subject" \| "not_a_school_topic" \| null }`; `reasonCode` obrigatório só em `unfeasible`; os três primeiros valores são os de `unsupportedTopicReasonList`; `label` é o nome limpo que vai à capa |

`validateKitPlan(plan, kitSlotPlan, subject)` devolve os códigos de etapa `plan` do §8.1.

## 7. Kit

### 7.1 `kitContentSchema` (saída do `generate`)

O modelo devolve só conteúdo; ano, assunto, dificuldade, tipo, bloco e texto-base de cada questão vêm das vagas e do plano na composição (§7.3). Há uma versão do schema por disciplina, e o JSON Schema enviado é o da disciplina do pedido.

| Campo | Tipo | Regra |
|---|---|---|
| `reviewSectionList` | um por assunto, na ordem | `{ topicRef, title: 3..60, paragraphList: kitText[1..4] (20..600), keyPointList: kitText[2..5] (5..140) }` |
| `workedExampleList` | exatamente `WORKED_EXAMPLE_COUNT` | `{ exampleId, title: 3..60, statement: kitText 10..600, table: kitTable \| null, stepList: kitText[2..6] (5..300), answer: solution, commentary: kitText 10..300 }`; `answer.correctOptionLabel` é `null` |
| `baseTextList` | Português: um por `baseTextBriefList`; Matemática: vazia | `{ baseTextId, title: 3..60, paragraphList: kitText[1..10] (10..800) }` |
| `practiceQuestionList` | exatamente `PRACTICE_QUESTION_COUNT`, ids `p1`..`p10` em ordem | `question` |
| `mockQuestionList` | exatamente `MOCK_QUESTION_COUNT`, ids `m1`..`m10` em ordem | `question` |
| `mockSuggestedMinutes` | int `MIN_MOCK_SUGGESTED_MINUTES`..`MAX_MOCK_SUGGESTED_MINUTES` (*novas*, 20 e 60) | tempo sugerido no cabeçalho de prova |
| `studyTip` | kitText 10..200 | a dica pontual do mascote (design doc §9) |

`question` = `{ questionId, statement: kitText 10..700, table: kitTable \| null, optionList: option[4] \| null, answer: solution }`; `optionList` presente só em múltipla escolha, com exatamente `MULTIPLE_CHOICE_OPTION_COUNT` (*nova*, 4) alternativas de rótulos `A`..`D` em ordem.

`option`: em Matemática `{ label, value: expectedAnswer }` (o PDF escreve a alternativa a partir do valor, então texto e valor nunca divergem); em Português `{ label, text: kitText 1..200 }`.

`solution`:

| Campo | Matemática | Língua Portuguesa |
|---|---|---|
| `correctOptionLabel` | letra em múltipla escolha; `null` em aberta | idem |
| `expectedAnswer` | qualquer tipo; `fraction` simplificada salvo pedido de outro denominador; `number` com `unit` quando há medida e `tolerance` 0 salvo arredondamento pedido; em múltipla escolha, igual ao `value` da correta | sempre `text`; em múltipla escolha, `value` igual ao texto da correta; `acceptedList` com as respostas equivalentes defensáveis das abertas |
| `computable` | `true` quando a resposta sai de um cálculo com os números do enunciado; só com `expectedAnswer` `number`, `fraction` ou `expression` | sempre `false` |
| `calculationExpression` | obrigatória se `computable`, senão `null`; sintaxe do mathjs, ponto decimal, sem separador de milhar, unidades do mathjs quando houver; só números do enunciado e fatores de conversão | sempre `null` |
| `solutionStepList` | kitText[1..6] (5..300): etapas essenciais com conta e unidade | kitText[0..4] |
| `explanation` | kitText 20..600: por que a resposta está certa e, em múltipla escolha, por que o erro mais provável está errado | idem |
| `evidenceQuote` | sempre `null` | obrigatória na questão com texto-base, senão `null`: cópia literal de 3..240 caracteres do texto-base |

### 7.2 `studyKitSchema` (publicado em `kit.study_kit`)

| Campo | Tipo |
|---|---|
| `formatVersion` | `"kit-v1"`: o render dos 12 meses de retenção escolhe o template por ele |
| `grade`, `subject`, `perceivedDifficulty` | do pedido |
| `taxonomyVersion`, `generationVersion` | §1 |
| `topicList` | `{ topicRef, label }[1..3]` na ordem; `label` é o rótulo da taxonomia ou `otherTopicAssessment.label` |
| `materialProfile` | §3.2 |
| `sourceWarningCodeList` | códigos da extração, sem `photoIndexList` |
| `reviewSectionList`, `baseTextList` | §7.1; texto-base com `block` do plano |
| `workedExampleList` | §7.1 + `topicRef` da vaga |
| `practiceQuestionList`, `mockQuestionList` | `question` do §7.1 + `{ block, number: 1..10, topicRef, difficulty, questionType, isContextualized, skillFocus, baseTextId }` |
| `mockSuggestedMinutes`, `studyTip` | §7.1 |
| `qualityCheckList` | `ValidationIssue[]` só com `severity: "warning"` (kit publicado nunca tem bloqueador) |

**Formato de exibição** (`formatExpectedAnswer`, core, F1-03), usado pelo render para alternativas de Matemática e respostas do gabarito: `number` em pt-BR (vírgula decimal, ponto de milhar) com a unidade depois, separada por espaço, salvo `R$`, que vem antes; `fraction` como `\(\frac{n}{d}\)`, com a unidade depois; `set` com os valores unidos por "; " (a vírgula é decimal); `text` como está. `expression` fica no dado na sintaxe do mathjs (ponto decimal, `*` explícito) e o render a escreve em LaTeX pela conversão que o adaptador do mathjs expõe (F1-04).

**`kitRepairSchema`** (saída do `generate` em modo reparo): as mesmas listas do `kitContentSchema` (`reviewSectionList`, `workedExampleList`, `baseTextList`, `practiceQuestionList`, `mockQuestionList`), cada uma só com os itens pedidos (pode ser vazia) e os mesmos schemas de item; sem `mockSuggestedMinutes` e `studyTip`. A composição confere que os ids devolvidos são exatamente os pedidos; diferente é `kit_slot_mismatch`.

O gabarito são os `answer` das 20 questões, na ordem dos blocos: `listAnswerKey(studyKit)` (core) monta as 20 entradas para o render e para a contagem. Não há lista de gabarito separada que possa divergir das questões.

### 7.3 Composição (core, `composeStudyKit`)

Junta conteúdo, vagas, plano e dados do pedido. Bloqueia com `kit_slot_mismatch` quando: ids de questão fora de `p1..p10`/`m1..m10` em ordem; ids de exemplo diferentes de `e1`, `e2`; seções de revisão fora dos assuntos e da ordem; textos-base diferentes dos `baseTextBriefList`; `optionList` presente em vaga aberta ou ausente em vaga de múltipla escolha; `evidenceQuote` ausente em questão com texto-base ou presente sem ele.

## 8. Validações

Severidade decidida pelo código, nunca pelo modelo. **B** = bloqueador: a etapa falha e entra a regeneração do §10. **A** = aviso: vai para `qualityCheckList` e o kit sai. Coluna "Reparo": `item` refaz só os itens; `kit` refaz o kit inteiro com o mesmo plano; `plano` refaz plano e kit; `não` falha sem regenerar. Cada código tem um único reparo; com vários códigos, vale o mais forte: `não` > `plano` > `kit` > `item`.

### 8.1 Plano (`validateKitPlan`, core)

| Código | Sev. | Reparo | Confere | PRD |
|---|---|---|---|---|
| `plan_output_invalid` | B | plano | saída fora do `kitPlanSchema`, incluindo `otherTopicAssessment` presente sem "outro" ou ausente com "outro" | §7.4.3 |
| `plan_slot_mismatch` | B | plano | `slotDetailList`, `topicObjectiveList` ou `workedExampleFocusList` diferentes das vagas, assuntos ou exemplos, ou fora de ordem | §7.2 |
| `plan_multiple_choice_mix` | B | plano | em algum bloco, múltipla escolha fora de `MIN_MULTIPLE_CHOICE_PER_BLOCK`..`MAX_MULTIPLE_CHOICE_PER_BLOCK` (*novas*, 3 e 7) | §7.2 "combinar" |
| `plan_contextualized_minority` | B | plano | simulado de Matemática com menos de `MIN_CONTEXTUALIZED_MATH_MOCK_COUNT` (*nova*, 6) vagas contextualizadas | §7.2 "predominam" |
| `plan_base_text_invalid` | B | plano | Português: simulado com menos de `MIN_MOCK_BASE_TEXT_COUNT` ou mais de `MAX_MOCK_BASE_TEXT_COUNT` (*novas*, 1 e 2) textos, vaga do simulado sem texto-base, mais de `MAX_PRACTICE_BASE_TEXT_COUNT` (*nova*, 1) na fixação, `baseTextId` inexistente ou de outro bloco; Matemática: qualquer texto-base | §7.2 |
| `other_topic_unfeasible` | B | não | `otherTopicAssessment.verdict` = `unfeasible`: refazer não muda o pedido | §7.5, §7.7 |

### 8.2 Kit: estrutura e respostas (`composeStudyKit`, `validateStudyKit`, core)

| Código | Sev. | Reparo | Confere | PRD |
|---|---|---|---|---|
| `kit_output_invalid` | B | kit | saída fora do `kitContentSchema` da disciplina: contagens 2/10/10, 4 alternativas, campos obrigatórios por disciplina, limites de texto | §7.4.5 contagens |
| `kit_slot_mismatch` | B | kit | §7.3 e reparo com ids diferentes dos pedidos | §7.4.5 referências quebradas |
| `topic_coverage_below_minimum` | B | não | algum assunto com menos de `MIN_QUESTION_COUNT_PER_TOPIC_PER_BLOCK` num bloco. Defesa: só dispara com bug da alocação, que refazer não corrige | §7.2 |
| `difficulty_distribution_mismatch` | B | não | bloco fora da distribuição deslocada do §5. Defesa, como a anterior | §7.2 |
| `option_duplicate` | B | item | dois distratores iguais: texto normalizado (Português) ou `MathEvaluator.equals` (Matemática) | §7.5 |
| `correct_option_mismatch` | B | item | alternativa correta diferente de `expectedAnswer` | §7.3, §7.5 |
| `distractor_equivalent` | B | item | distrator igual à correta: texto normalizado (Português) ou equivalente por `equals` (Matemática: 1/2 e 0,5) | §7.3, §7.5 |
| `math_recalculation_mismatch` | B | item | `computable`: `evaluate(calculationExpression)` diferente de `expectedAnswer` por `equals` (unidade e tolerância incluídas) | §7.3, §7.5 |
| `math_expression_invalid` | B | item | `computable` com expressão que o avaliador não aceita (`parse_error`, `unsupported`, `not_finite`) | §7.3 |
| `example_recalculation_mismatch` | B | item | o mesmo recálculo nos exemplos resolvidos | §7.5 |
| `evidence_quote_not_found` | B | item | `evidenceQuote` não é trecho literal do texto-base citado (comparação com espaços e aspas normalizados) | §7.3 |
| `non_computable_excess` | A | — | Matemática com mais de `MAX_NON_COMPUTABLE_MATH_QUESTION_COUNT` (*nova*, 6) das 20 questões não computáveis. Aviso, e não bloqueador, porque kit só de geometria conceitual (classificar ângulos, contar arestas) tem poucas questões computáveis de verdade (§15) | §7.3 |
| `expression_number_not_in_statement` | A | — | número de `calculationExpression` que não está no enunciado nem na tabela e não é fator de `UNIT_CONVERSION_FACTOR_LIST` (*nova*: 10, 100, 1000, 60, 24, 7, 12). Aviso, e não bloqueador, porque número por extenso no enunciado ("três", "metade", "dúzia") daria falso bloqueador; a interpretação do enunciado é conferida pela revisão, que bloqueia (§15) | §7.3 |
| `fraction_not_simplified` | A | — | `fraction` do gabarito fora da forma irredutível (pode ser pedido do enunciado; a revisão julga) | §7.3 |
| `unit_missing` | A | — | assunto com `measurement_unit` e resposta `number` sem unidade | §7.3 |

### 8.3 Kit: conteúdo (`validateStudyKit`, core; marcação no worker)

| Código | Sev. | Reparo | Confere | PRD |
|---|---|---|---|---|
| `figure_reference` | B | item | em enunciado, tabela, alternativa e enunciado de exemplo (nunca em texto-base, revisão ou explicação): só comandos que mandam a criança a uma figura ou material ausente, pela lista fechada do §8.4. Precisão antes de cobertura: dependência de figura que a lista não pega é bloqueada pela revisão (`review_missing_data`) | §7.5 |
| `personal_data_pattern` | B | item | telefone, e-mail ou CPF em qualquer texto do kit, inclusive `topicList[].label` (padrões em §8.4) | §7.5 |
| `external_link` | B | item | URL, `www.` ou arroba de rede social, em qualquer texto do kit, inclusive `topicList[].label` | §7.5 |
| `blocked_term` | B | item | termo de `blockedTermList` (core, F1-03: palavrões e ofensas), palavra inteira, em qualquer texto do kit, inclusive `topicList[].label` | §7.4.5, §7.5 |
| `duplicate_question` | B | item | duas das 20 questões com enunciado e alternativas iguais depois de normalizar | §7.4.5 |
| `math_markup_invalid` | B | item | `\(` e `\)` sem par (core) ou trecho que o KaTeX não analisa (worker) | §7.5 render |
| `similar_question` | A | — | similaridade de Jaccard das palavras de dois enunciados ≥ `DUPLICATE_SIMILARITY_THRESHOLD` (*nova*, 0,8) | §7.4.5 |
| `example_similar_to_question` | A | — | exemplo com a mesma similaridade de uma questão | §6 |
| `mock_hint` | A | — | simulado com "dica", "lembre-se", "como vimos", "volte à revisão", "como no exemplo" | §7.2 |
| `statement_too_long` | A | — | enunciado acima de `MAX_STATEMENT_WORD_COUNT_BY_GRADE` (*nova*: 4º 60, 5º 70, 6º 90, 7º 100 palavras, sem texto-base e tabela) | §7.1.2 |
| `base_text_length` | A | — | texto-base fora de `BASE_TEXT_WORD_RANGE_BY_GRADE` (*nova*: 4º 100–220, 5º 120–260, 6º 150–320, 7º 180–380 palavras) | §7.3 |
| `markup_forbidden` | B | item | Markdown, tag HTML ou emoji em texto do kit, pelos padrões do §8.4, fora dos trechos `\( \)` (o render escapa todo texto de qualquer jeito, §8.6) | §6 |

### 8.4 Padrões determinísticos (F1-03, com testes de falso positivo)

- **Dado pessoal:** telefone brasileiro com DDD (com ou sem parênteses, hífen ou espaço, 8 ou 9 dígitos), e-mail, CPF formatado ou 11 dígitos seguidos. Não podem casar: valores em reais ("R$ 1.250,00"), números grandes de enunciado ("12.345"), horários ("14h30"), frações e expressões.
- **Figura:** lista fechada de comandos, casados como expressão inteira depois de `normalizeKeywordText`; nada fora dela bloqueia:
  - verbo + objeto visual: "observe", "veja" ou "olhe" seguido de "a figura", "a imagem", "o desenho", "o grafico" ou "a ilustracao";
  - objeto visual + posição: "a figura", "na figura", "da figura", "o desenho", "no desenho", "a imagem", "na imagem", "o grafico", "no grafico", "a ilustracao" ou "na ilustracao", seguidos de "abaixo", "acima" ou "ao lado";
  - comando para material da criança: "veja", "abra", "consulte" ou "copie" seguido de "o livro", "a apostila", "o caderno", "seu livro", "sua apostila" ou "seu caderno"; e "na pagina {número} do livro" ou "da apostila".
  - Testes de falso positivo obrigatórios (não podem casar): "observe a tabela", "observe o trecho", "observe a frase", "observe o verso", "figura de linguagem", "imagem poética", "quantos lados há na figura descrita", "Júlia leu 15 páginas do seu livro por dia", "parou na página 48", "usou 12 folhas do seu caderno", "comprou 3 pacotes de figurinhas".
- **Marcação proibida:** aplicada fora dos trechos `\( \)`, com os padrões: `**` ou `__` colados a uma letra (`(?<=\p{L})(\*\*|__)|(\*\*|__)(?=\p{L})`), `#` seguido de espaço no início de linha, link `[texto](endereço)`, crase, tag `</?[a-z][a-z0-9]*[^<>]*>` e emoji por `\p{Extended_Pictographic}`. Testes de falso positivo obrigatórios: lacuna "O gato ______ no telhado", "use <, > ou =", "3 < 5 e 7 > 2", "25 °C", números e "R$ 12,50".
- **Descrição para o reparo:** todo código determinístico tem uma frase pt-BR fixa em `validationIssueDescriptionMap` (core) dizendo o que corrigir; a linha de reparo leva a frase e o `excerpt`.
- **Dica no simulado** e **termos bloqueados:** listas no core, casadas como palavra inteira depois de `normalizeKeywordText`.

### 8.5 Revisão (`interpretReview`, core)

O modelo devolve códigos sem prefixo (§9); o core grava com prefixo `review_` e severidade fixa:

| Código | Sev. | Reparo |
|---|---|---|
| `review_answer_mismatch` (MC: letra resolvida pelo revisor ≠ `correctOptionLabel`, comparação determinística) | B | item |
| `review_answer_incorrect`, `review_answer_ambiguous`, `review_explanation_inconsistent`, `review_missing_data`, `review_off_topic`, `review_above_grade`, `review_inappropriate_content`, `review_personal_data`, `review_evidence_unsupported`, `review_example_incorrect` | B | item |
| `review_kit_section_incorrect` (a seção do assunto em `targetId`), `review_kit_base_text_inappropriate` (o texto-base em `targetId` e as questões que o citam) | B | item |
| `review_kit_off_topic`, `review_kit_above_grade`, `review_kit_inappropriate_content`, `review_kit_personal_data` | B | kit |
| `review_weak_distractor`, `review_difficulty_mismatch`, `review_hint_in_mock`, `review_variety_as_error`, `review_fraction_not_simplified`, `review_unclear_wording`, `review_kit_style_mismatch` | A | — |

Item de `itemReviewList` vira `review_{código}`; item de `kitIssueList` vira `review_kit_{código}`, para cada código ter um só reparo. Em múltipla escolha, `independentAnswer` é normalizado (sem acento, minúsculas, sem pontuação; aceita "B", "b)", "(B)", "letra B", "alternativa B") antes da comparação; sem exatamente uma letra válida, a saída é inválida (`review_output_invalid`, §9).

A revisão é assistiva (PRD §7.5): marcar problema bloqueia; não marcar não prova correção.

### 8.6 Render (F1-08)

Todo `kitText` entra no template escapado como texto; só os trechos entre `\(` e `\)` passam pelo KaTeX. Nenhum texto do modelo vira HTML.

| Código | Sev. | Tratamento |
|---|---|---|
| `render_failed` | B | segunda tentativa de render (`jobs.md` §2); persistindo, `render_failed` |
| `render_item_missing` | B | alguma das 20 questões, 2 exemplos ou 20 respostas ausente do DOM renderizado de um dos dois PDFs; segue `render_failed` |
| `render_overflow` | B | item cortado ou escondido por overflow; segue `render_failed` |
| `page_count_out_of_range` | A | atividades fora de `ACTIVITIES_PAGE_RANGE` (*nova*, 8–14) ou gabarito fora de `ANSWER_KEY_PAGE_RANGE` (*nova*, 3–6) |

### 8.7 Regras de assunto da taxonomia → códigos

Só `unit_missing` depende da regra: roda só nas questões de assunto com `measurement_unit`. O "outro" não tem regras, então nele o `unit_missing` não roda; unidade errada no "outro" ainda é pega pelo recálculo (unidade comparada por `equals`) e pela revisão. Todos os outros códigos rodam em todo kit; a regra do assunto (`validationRuleList`, `taxonomia.md`) entra no prompt do assunto (`{{TOPIC_BLOCK}}`) e diz quais códigos são o risco principal dele.

| Regra | Códigos |
|---|---|
| `rational_equivalence` | `distractor_equivalent`, `option_duplicate` (por `equals`), `fraction_not_simplified`, `review_fraction_not_simplified` |
| `measurement_unit` | `unit_missing` (só em assunto com a regra), `math_recalculation_mismatch` (unidade comparada por `equals`) |
| `figure_free_statement` | `figure_reference`, `review_missing_data` |
| `text_evidence` | `evidence_quote_not_found`, `review_evidence_unsupported` |
| `single_normative_answer` | `distractor_equivalent` (texto), `review_answer_ambiguous` |
| `linguistic_variety_respect` | `review_variety_as_error` |

## 9. Revisão (`reviewResultSchema`, saída do `review`)

| Campo | Tipo | Regra |
|---|---|---|
| `itemReviewList` | revisão completa: exatamente 22, na ordem `p1`..`p10`, `m1`..`m10`, `e1`, `e2`; revisão de reparo: exatamente as questões e exemplos refeitos, na mesma ordem | `{ itemId, independentAnswer: string 1..200, issueList: { code, note: string 5..200 }[0..5] }`; em múltipla escolha, `independentAnswer` é só a letra |
| `kitIssueList` | 0..10 | `{ code, targetId: topicRef \| "t1".."t3" \| null, note: string 5..200 }`; `targetId` obrigatório em `section_incorrect` (o assunto da seção) e `base_text_inappropriate` (o texto-base) |

Códigos de item: `answer_incorrect`, `answer_ambiguous`, `explanation_inconsistent`, `missing_data`, `off_topic`, `above_grade`, `inappropriate_content`, `personal_data`, `evidence_unsupported`, `example_incorrect`, `weak_distractor`, `difficulty_mismatch`, `hint_in_mock`, `variety_as_error`, `fraction_not_simplified`, `unclear_wording`. Códigos de kit: `section_incorrect`, `base_text_inappropriate`, `off_topic`, `above_grade`, `inappropriate_content`, `personal_data`, `style_mismatch`.

O revisor recebe o kit em duas folhas, questões primeiro e gabarito depois, e resolve cada item antes de ler o gabarito (`prompts-v1.md`). Na revisão de reparo, as seções de revisão e os textos-base refeitos também vão para o revisor, que os confere em `kitIssueList`. Saída inválida (`review_output_invalid`: fora do schema ou letra de múltipla escolha inválida): uma nova chamada de revisão, que não gasta a regeneração do kit; persistindo, `ai_output_invalid`.

## 10. Regeneração

`MAX_REGENERATION_COUNT` = 1 por pedido, gasta pelo primeiro bloqueador de plano, kit ou revisão (`jobs.md` §2). O reparo da regeneração segue a coluna "Reparo" do código mais forte presente (`não` > `plano` > `kit` > `item`):

| Reparo | O que roda de novo |
|---|---|
| `plano` | `plan`, `generate` completo, validação e revisão completas |
| `kit` | `generate` completo com o mesmo plano, validação e revisão completas |
| `item` | `generate` em modo reparo só com os itens marcados (questões, exemplos, seções de revisão por assunto e textos-base; texto-base marcado leva junto as questões que o citam) e a lista `{ itemId, código, nota da revisão }`; a composição troca esses itens; validação do kit inteiro; revisão só dos itens refeitos, juntada à anterior. Mais de `MAX_REPAIR_ITEM_COUNT` (*nova*, 8) itens vira `kit` |
| `não` | `generation_failed`, sem gastar a regeneração: `fail_reason_code` = `other_topic_unfeasible` para o "outro" inviável e `generation_blocked` para os códigos de defesa |

Bloqueador depois da regeneração → `generation_failed`: `ai_output_invalid` (saída inválida), `generation_blocked` (bloqueador de validação ou revisão), `ai_cost_exceeded` (teto `MAX_AI_COST_CENTS_PER_ORDER`, conferido antes de cada chamada; valor definido na F1-07 com o custo medido) ou `render_failed`.

## 11. Constantes novas (F1-03, em `constants.ts`)

| Constante | Valor proposto | Uso |
|---|---|---|
| `OTHER_TOPIC_REF` | `"other"` | §2 |
| `MAX_TOPIC_CANDIDATE_COUNT` | 6 | §3.1 |
| `MAX_EVIDENCE_LENGTH` | 120 | §3.1 |
| `MAX_TERMINOLOGY_COUNT`, `MAX_TERM_LENGTH` | 10, 40 | §3.2 |
| `MAX_CONTEXT_THEME_COUNT` | 5 | §3.2 |
| `LEGIBILITY_SCORE_MAP` | `good` 1, `partial` 0,5, `unreadable` 0 | §3.3 |
| `PERCEIVED_DIFFICULTY_SHIFT_DIRECTION_MAP` | `basic` +1; `intermediate` −1; `unknown` 0 (multiplica `MAX_PERCEIVED_DIFFICULTY_SHIFT`) | §5 |
| `MULTIPLE_CHOICE_OPTION_COUNT` | 4 | §7.1 |
| `MIN_MULTIPLE_CHOICE_PER_BLOCK`, `MAX_MULTIPLE_CHOICE_PER_BLOCK` | 3, 7 | §8.1 |
| `MIN_CONTEXTUALIZED_MATH_MOCK_COUNT` | 6 | §8.1 |
| `MIN_MOCK_BASE_TEXT_COUNT`, `MAX_MOCK_BASE_TEXT_COUNT`, `MAX_PRACTICE_BASE_TEXT_COUNT` | 1, 2, 1 | §8.1 |
| `MIN_MOCK_SUGGESTED_MINUTES`, `MAX_MOCK_SUGGESTED_MINUTES` | 20, 60 | §7.1 |
| `MAX_NON_COMPUTABLE_MATH_QUESTION_COUNT` | 6 | §8.2 |
| `UNIT_CONVERSION_FACTOR_LIST` | 10, 100, 1000, 60, 24, 7, 12 | §8.2 |
| `DUPLICATE_SIMILARITY_THRESHOLD` | 0,8 | §8.3 |
| `MAX_STATEMENT_WORD_COUNT_BY_GRADE` | 60, 70, 90, 100 | §8.3 |
| `BASE_TEXT_WORD_RANGE_BY_GRADE` | 100–220, 120–260, 150–320, 180–380 | §8.3 |
| `MAX_REPAIR_ITEM_COUNT` | 8 | §10 |
| `ACTIVITIES_PAGE_RANGE`, `ANSWER_KEY_PAGE_RANGE` | 8–14, 3–6 | §8.6 |

Já existem e são usadas aqui: `MAX_PHOTO_COUNT`, `MIN_TOPIC_COUNT`, `MAX_TOPIC_COUNT`, `WORKED_EXAMPLE_COUNT`, `PRACTICE_QUESTION_COUNT`, `MOCK_QUESTION_COUNT`, `ANSWER_KEY_COUNT`, `PRACTICE_DIFFICULTY_DISTRIBUTION`, `MOCK_DIFFICULTY_DISTRIBUTION`, `MAX_PERCEIVED_DIFFICULTY_SHIFT`, `MIN_QUESTION_COUNT_PER_TOPIC_PER_BLOCK`, `MAX_REGENERATION_COUNT`, `MAX_NOTE_LENGTH`, `MAX_OTHER_TOPIC_LENGTH`.

## 12. Casos de regressão (F1-10)

### 12.1 Onde ficam

- `tests/pedagogy/cases/{grade}-{subject}-{slug}/case.json` (no git) e `tests/pedagogy/cases/{grade}-{subject}-{slug}/photos/` (**fora do git**, regra de `testing.md`). O nome do diretório é o `caseId` (ex.: `5-math-fracoes-manuscrito`).
- Fotos reais com os dados pessoais cobertos; nos casos de dado pessoal, nomes e telefones **inventados** escritos no caderno, nunca reais. O humano guarda as fotos fora do repositório; o `case.json` grava o SHA-256 de cada uma e o runner recusa foto diferente.
- Saída de cada rodada em `tests/pedagogy/output/{runId}/` (fora do git): `study_kit.json`, os dois PDFs, as issues e o relatório completo, para leitura humana.
- Resumo da rodada em `docs/pedagogy/regressao/{AAAA-MM-DD}-{generationVersion}.md`, só com ids, códigos e números: nunca evidência, perfil, nota da revisão ou trecho do kit (regra de `docs.md`).

### 12.2 `case.json`

| Campo | Tipo | Regra |
|---|---|---|
| `caseId` | string | igual ao nome do diretório |
| `grade`, `subject` | enums do core | — |
| `photoList` | `{ fileName, sha256, expectedLegibility: "good" \| "partial" \| "unreadable" }[1..MAX_PHOTO_COUNT]` | ordem de envio |
| `tagList` | enum[] | `handwritten`, `bad_photo`, `fractions`, `ambiguous_statement`, `personal_data`, `unsupported_topic`, `only_unsupported`, `other_topic`, `figures`, `grade_mismatch`, `regression` (defeito que virou caso) |
| `expectedPreview` | objeto | `{ outcome: "preview_ready" \| "analysis_failed", failCode: "photos_unreadable" \| "only_unsupported_topics" \| "no_topic_found" \| null, requiredTopicIdList, acceptableTopicIdList, unsupportedTopicIdList, requiredSourceWarningCodeList }` |
| `confirmation` | objeto \| null | o que o "responsável" confirma: `{ topicIdList, otherTopicText, perceivedDifficulty, noteText }`; `null` usa os 3 primeiros de `requiredTopicIdList`, sem opcionais |
| `expectedKitOutcome` | `"ready"` \| `"failed"` \| `"not_applicable"` | estado final do pedido; `not_applicable` quando a prévia falha |
| `note` | string até 300 | por que o caso existe, sem conteúdo do material |

### 12.3 O que o runner faz e mede

Para cada caso: extração por foto com o modelo e o prompt configurados → junção e decisão da prévia → confirmação do caso → alocação → `plan` → `generate` → composição → validação → `review` → regeneração quando houver → render dos dois PDFs. Mesmo código da produção (`AiProvider` real, `MathEvaluator` real, render real), sem banco nem fila.

| Verificação do caso | Falha quando |
|---|---|
| `preview_outcome_mismatch` | resultado ou código da prévia diferente do esperado |
| `required_topic_missing` | assunto de `requiredTopicIdList` fora dos candidatos |
| `unexpected_topic` | candidato `high` fora de `required` ∪ `acceptable` (candidato `medium` inesperado é só aviso) |
| `unsupported_topic_missed` | área de `unsupportedTopicIdList` não sinalizada |
| `legibility_mismatch` | foto esperada `unreadable` tratada como utilizável, ou foto esperada `good` tratada como `unreadable` |
| `source_warning_missed` | aviso de `requiredSourceWarningCodeList` ausente |
| `kit_outcome_mismatch` | resultado final do kit diferente do esperado: é o **bloqueador crítico inesperado** do gate |

Métricas por caso (não reprovam sozinhas): bloqueadores e avisos da primeira tentativa por código, se regenerou e com que reparo, custo da prévia e do kit em centavos por etapa, tempo por etapa, páginas de cada PDF.

Relatório agregado (por caso e por `topicRef`, com o "outro" à parte): casos aprovados por verificação, bloqueadores críticos inesperados, taxa de regeneração, códigos mais frequentes, custo médio e p95 por prévia e por kit, tempo p50 e p95 da geração.

## 13. Homologação (PRD §7.6) e gate F1 → F2

### 13.1 Os 40 casos

4 anos × 2 disciplinas × 5 casos, com no mínimo: 10 manuscritos, 4 com foto ruim (1 totalmente ilegível, que deve ser recusada), 4 de Matemática com frações, 2 com enunciado ambíguo no material, 4 com dado pessoal inventado visível, 2 com assunto não atendido junto de assuntos atendidos, 1 só com assunto não atendido e 2 com "outro". Um caso pode somar tags.

### 13.2 Critérios do gate (propostos; o humano aprova)

| # | Critério | Meta |
|---|---|---|
| 1 | Bloqueador crítico inesperado (`kit_outcome_mismatch` ou `preview_outcome_mismatch`) | 0 nos 40 casos |
| 2 | Extração (`required_topic_missing`, `unexpected_topic`, `unsupported_topic_missed`) | ao menos 36 dos 40 casos sem falha |
| 3 | Foto ilegível recusada e `personal_data_visible` sinalizado | 100% dos casos com essas tags |
| 4 | Auditoria do professor | zero defeito crítico na amostra (§13.3) |
| 5 | Custo médio por kit (todas as chamadas de IA do pedido, com extração e regeneração) | ≤ 10% de `KIT_PRICE_CENTS` |
| 6 | Custo médio por prévia | ≤ R$ 0,10, registrado no PRD §3 pela F1-11 |
| 7 | Tempo de geração p95 | ≤ 5 min (PRD §3, da confirmação do Pix aos dois PDFs). O runner não tem Pix nem fila e mede do `plan` aos PDFs, abaixo do tempo real; acima da meta, ação registrada, sem bloquear o gate |

Defeito crítico achado na auditoria ou na regressão é corrigido e vira caso com a tag `regression` (PRD §7.6).

### 13.3 Auditoria do professor (F1-11)

- **Amostra:** 1 kit por ano × disciplina, sorteado entre os `ready` da regressão (8 kits), mais os 2 kits de amostra: 10 kits, 200 questões.
- **Planilha:** uma linha por item (`kit`, `itemId`, classe, código, comentário), mais uma por seção de revisão e por texto-base.
- **Rubrica:**

| Classe | Códigos | Efeito |
|---|---|---|
| Crítico | `answer_wrong` (gabarito errado), `impossible_statement` (sem resposta ou com outra resposta certa não prevista), `wrong_subject_matter` (fora do assunto ou do ano), `missing_figure` (depende de figura ou informação ausente), `inappropriate` (conteúdo impróprio), `personal_data` | bloqueia o lançamento; corrigir e virar caso |
| Grave | `wrong_step` (passo ou explicação errada com resposta certa), `weak_distractors` (em série), `difficulty_off` (muito diferente do rótulo), `base_text_off` (texto-base inadequado ao ano), `variety_as_error` | o mesmo defeito em 2 ou mais kits é corrigido antes do lançamento |
| Leve | `wording`, `typo`, `layout` | registrado |

A mesma rubrica serve à auditoria amostral semanal em produção (PRD §7.6).

## 14. Quem implementa o quê

| Feature | Lê | Implementa |
|---|---|---|
| F1-03 `schemas-e-validacoes-do-kit` | §2–§11 | schemas (`photoExtractionSchema`, `materialProfileSchema`, `kitPlanSchema`, `kitContentSchema` e reparo, `studyKitSchema`, `reviewResultSchema`, `validationIssueSchema`), mapas de rótulo, `mergePhotoExtractionList`, `decidePreviewOutcome`, `planKitSlots`, `validateKitPlan`, `composeStudyKit`, `listAnswerKey`, `formatExpectedAnswer`, `validationIssueDescriptionMap`, `validateStudyKit` (com `MathEvaluator` injetado), `interpretReview`, padrões e listas do §8.4, constantes do §11, rótulos pt-BR (`exerciseFormatLabelMap`, `notationLabelMap`, `difficultyLabelMap`, `perceivedDifficultyLabelMap`, `questionBlockLabelMap`) para a prévia e os placeholders; uma fixture válida e uma inválida por código |
| F1-04 `avaliador-matematico` | §7.1, §8.2 | `MathEvaluator.evaluate` e `equals` com unidade, fração, tolerância e expressão; conversão de `expression` para LaTeX, usada pelo render |
| F1-05 `adaptador-de-ia` | §1 | `AiProvider` real com o JSON Schema da etapa e `usage` |
| F1-06 `pipeline-extracao` | §1, §3, `prompts-v1.md` | prompt `extract` v1, chamada por foto, cache com expiração, chamada de `mergePhotoExtractionList` e `decidePreviewOutcome` da F1-03 (por isso depende da F1-03) |
| F1-07 `pipeline-geracao` | §1, §5–§10, `prompts-v1.md` | prompts `plan`, `generate` (com reparo) e `review` v1; orquestração; regeneração; `checkMathMarkup`; `ai_call`; teto de custo |
| F1-08 `render-pdf` | §2 marcação, §7.2, §8.6 | templates por `formatVersion`, alternativas a partir do `value`, gabarito por `listAnswerKey`, códigos de render |
| F1-10 `regressao-pedagogica` | §12, §13 | runner, formato de caso, relatório |
| F1-11 `homologacao-e-amostras` | §13 | auditoria e metas no PRD §3 |
| F2-02, F2-03, F2-09 | §3.3, §4 | persistência da extração, decisão da prévia, recusa do "outro", bloco "O que entendi" |

## 15. Pontos para aprovação do humano

Propostas desta spec que interpretam o PRD ou o design doc. A spec segue com elas; mudar qualquer uma é trocar o valor ou o texto aqui antes da F1-03.

1. **Metas do gate (§13.2):** extração em 36 dos 40 casos, custo por prévia ≤ R$ 0,10, amostra de 10 kits para o professor e a rubrica do §13.3.
2. **Dificuldade percebida (§5):** "básica" troca uma intermediária por uma fácil em cada bloco; "intermediária" faz o contrário; "não sei" não muda nada. O PRD §6 só diz que ela desloca até 1 questão entre fácil e intermediária.
3. **Relevância (§4, §5):** a ordem da prévia é a relevância, e as questões que sobram do mínimo vão aos primeiros assuntos.
4. **Avisos em vez de bloqueadores:** `expression_number_not_in_statement` e `non_computable_excess` (§8.2), pelos motivos da tabela. A regressão mede quantas vezes disparam e pode promovê-los.
5. **Textos que faltam no design doc §5.2:** (a) material legível de outra disciplina ou de outro ano (`no_topic_found` com `subject_mismatch` ou `grade_mismatch`), hoje com o texto de foto ilegível; proposta: "Não encontrei nesta matéria um assunto de {disciplina} do {ano}. Confere o ano e a disciplina?"; (b) `lp-essay-writing` tem motivo `open_writing`, e o texto "porque depende de imagem ou de fala" não serve para redação; proposta: "Ainda não consigo preparar {assunto}, porque é produção de texto que precisa de correção. O kit sai com os outros assuntos."

## 16. Histórico

- **1.0 (19/10/2026):** versão inicial (F1-02).

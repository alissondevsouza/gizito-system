---
feature: F1-02 spec-pedagogica-executavel
module: pedagogy
round: 3
verdict: REPROVADO
updated: 2026-10-20
---

# Review: F1-02 spec-pedagogica-executavel

## Rodada 1

### Comandos executados
| Comando | Resultado |
|---|---|
| `bun test` (core) | 346 pass, 0 fail |
| `bun run lint` | 193 arquivos, sem erros |
| `bun run typecheck --filter=@gizito/core` | ok |
| `bun -e` com `findUnsupportedTopicList` sobre rótulos e descrições da taxonomia | colisões em `ma7-cartesian-symmetry` (decisão documentada) e `lp7-verb-moods` (não documentada) |
| `grep` nos rules | contradições em `worker.md:27` e `:29` |

### Critérios de aceite
| RF | Atendido | Evidência (teste ou arquivo) |
|---|---|---|
| RF-01 | sim | `unsupported.test.ts`; `description` idêntica à `taxonomyExclusionList` removida |
| RF-02 | sim | `unsupported.test.ts` |
| RF-03 | sim, com falha latente | `version.test.ts`; unicidade só do fingerprint de assuntos |
| RF-04 | sim | `markdown.test.ts`, teste de sincronia |
| RF-05 | com ressalvas | contradição em `other_topic_unfeasible`; lacunas de executabilidade |
| RF-06 | não | limites digitados nos prompts |
| RF-07 | sim | §12 e §13 |
| RF-08 | não | `worker.md` contradiz a spec |

### Achados
- [CRÍTICO] `docs/pedagogy/prompts-v1.md` — limites digitados no texto (40 caracteres, 1 a 6 etapas, 2 a 5 pontos-chave, 200 caracteres, A a D) — recalibrar o schema faria o modelo seguir o prompt e falhar no Zod — usar placeholder ou deixar ao JSON Schema.
- [CRÍTICO] `.claude/rules/worker.md:27-29` — `generate` validado por `studyKitSchema` e toda inconsistência da revisão como bloqueador — contradiz a spec (§1, §7, §8.5) onde a F1-07 trabalha — reescrever apontando para a spec.
- [CRÍTICO] `docs/pedagogy/spec-pedagogica.md` §8.1 — "ausente sem outro é `plan_output_invalid`" contradiz o §6 (`null` sem outro); ausência com outro caía em `other_topic_unfeasible` sem regenerar — presente sem outro ou ausente com outro → `plan_output_invalid`.
- [ALERTA] `docs/engineering/jobs.md` §2 — fluxo de regeneração diferente da spec, sem registro.
- [ALERTA] `spec.md` Decisões — faltam as decisões de desenho que mudam contrato.
- [ALERTA] spec §8.5 — os mesmos códigos de revisão com reparo `item` e `kit`; precedência sem `não`.
- [ALERTA] spec — lacunas: schema de reparo, revisão de seções e textos-base refeitos, formato de exibição de `expression`/`set`, normalização de `independentAnswer`, desempate na junção, natureza de `extraction_output_invalid`.
- [ALERTA] spec §8.2–§8.3 — códigos inalcançáveis ou duplicados (`topic_coverage_below_minimum` e `difficulty_distribution_mismatch` com reparo inútil, `reference_broken`, `distractor_equivalent` contido em `option_duplicate`, `external_link` e `markup_forbidden` se o `kitText` for imposto no Zod).
- [ALERTA] spec §3.1 — refinamento de listas vazias em foto não utilizável sem o prompt pedir; deslize vira saída inválida.
- [ALERTA] spec §8.2 — `expression_number_not_in_statement` e `non_computable_excess` só aviso, sem decisão registrada.
- [ALERTA] spec §3.3 — `no_topic_found` mostra "Foto ilegível" para material legível de outra disciplina; motivo `open_writing` não cabe no texto do design doc §5.2.
- [ALERTA] spec §14 — junção atribuída à F1-03 e à F1-06; F1-06 passa a depender da F1-03 sem o roadmap dizer.
- [ALERTA] `version.test.ts:31` — unicidade do fingerprint de assuntos impede `tax-v2` que mude só os não atendidos.
- [ALERTA] `unsupported.ts` — "producao de textos" casa com a descrição de `lp7-verb-moods`.
- [ALERTA] `prompts-v1.md` — `otherTopicAssessment.label` vem de texto não confiável, entra no `generate`/`review` e na capa; `<plano>` não marcado como dado.
- [ALERTA] spec §3 — cache da extração guarda texto derivado da foto sem prazo.
- [ALERTA] spec §8.3 — `figure_reference` sem campos definidos; "do livro" e "caderno" casam com narrativa de texto-base.
- [SUGESTÃO] "R$ 2,99" digitado; meta de tempo medida de outro ponto que o PRD §3; `ai_call.prompt_version` ambíguo; faltam mapas de rótulo de dificuldade; `PERCEIVED_DIFFICULTY_SHIFT_MAP` repete o máximo; falta tabela regra de assunto → códigos e as métricas separadas do "outro"; `mixed_number` sem forma de resposta; `photoIssueList` sem uso; `expectedKitOutcome` mistura estado e evento; `core.md` sem `equals`; Status do `spec.md` desatualizado.

### Regressão pedagógica
Pendente: `bun run test:pedagogy` só existe na F1-10 (`known-issues.md`, linha da `tax-v1`, estendida à lista de não atendidos).

### Resposta do orquestrador
Corrigidos:
- CRÍTICO 1: limites retirados do texto dos prompts; o que não é placeholder vem do `{{OUTPUT_JSON_SCHEMA}}`; ids sem contagem embutida ("ids p… e m…").
- CRÍTICO 2: `worker.md` reescrito (alocação, `kitPlanSchema`, `kitContentSchema` → `composeStudyKit`, severidade por código, reparo).
- CRÍTICO 3: `plan_output_invalid` cobre avaliação presente sem "outro" e ausente com "outro"; `other_topic_unfeasible` só para `verdict = unfeasible`.
- `jobs.md` 1.4 com o fluxo novo e o `fail_reason_code` `other_topic_unfeasible`; ADR-0010 (proposto) com as decisões de arquitetura; linha no índice de ADRs.
- Decisões completas no `spec.md`.
- Revisão: códigos de `kitIssueList` com prefixo `review_kit_`, cada código com um só reparo; precedência `não` > `plano` > `kit` > `item`.
- Lacunas: `kitRepairSchema` (§7.1); seções e textos-base refeitos entram na revisão de reparo (§9); `formatExpectedAnswer` e LaTeX de `expression` pela F1-04 (§7.1, §14); normalização de `independentAnswer` e `review_output_invalid` (§8.5, §9); desempate pela ordem de `listTopics` (§3.3); `extraction_output_invalid` é falha definitiva da foto, que conta como não utilizável (§3.3).
- Códigos: defesa com reparo `não`; `reference_broken` removido (a composição cobre); `option_duplicate` só entre distratores e `distractor_equivalent` contra a correta nas duas disciplinas; `kitText` no Zod só com trim e tamanho.
- Extração: sem refinamento entre campos, a junção descarta; prompt pede as duas listas vazias.
- §14 e roadmap 1.4: F1-06 depende da F1-03 e só chama a junção.
- `version.test.ts`: unicidade do par de fingerprints.
- "producao de textos" removida; teste de que rótulo e descrição atendidos não disparam a recusa (exceção só `ma7-cartesian-symmetry`); fingerprint da lista atualizado (a lista ainda não foi mesclada).
- `<plano>` marcado como orientação; `label` sem copiar ordens ou nomes; `personal_data_pattern`, `external_link` e `blocked_term` varrem `topicList[].label`.
- Cache da extração expira com a foto (`PHOTO_RETENTION_DAYS`).
- `figure_reference` só em enunciado, tabela, alternativa e enunciado de exemplo, com comandos e "do seu livro/caderno/apostila".
- Sugestões: todas aplicadas (meta de custo sem valor digitado, tempo com a diferença do runner, `prompt_version` por etapa, mapas de rótulo, `PERCEIVED_DIFFICULTY_SHIFT_DIRECTION_MAP`, §8.7, métricas do "outro" à parte, `mixed_number`, uso de `photoIssueList`, `expectedKitOutcome` com estado, `equals` no `core.md`, Status).

Contestados ou levados ao humano:
- `expression_number_not_in_statement` e `non_computable_excess` seguem avisos: número por extenso ("três", "metade") e geometria conceitual dariam falso bloqueador, e a interpretação errada já é bloqueada pela revisão (roadmap, tabela de riscos). Decisão registrada e posta para aprovação no §15 da spec pedagógica; a regressão pode promovê-los.
- Textos de `no_topic_found` com disciplina ou ano trocado e de `lp-essay-writing` são mudança de design doc: propostas no §15, sem alterar o design doc antes da decisão do humano.

## Rodada 2 (revalidação dos pontos corrigidos, diff `1d820dd..137dd8a`)

### Comandos executados
| Comando | Resultado |
|---|---|
| `git diff 1d820dd..137dd8a` | lido inteiro (15 arquivos) |
| `bun test src/__tests__/pedagogy/taxonomy` (core) | 63 pass, 0 fail |
| `bun -e` com `findUnsupportedTopicList` | "produção de textos" → `[]`; "produção textual" e "redação" → `lp-essay-writing` |

### Critérios de aceite
| RF | Atendido | Evidência |
|---|---|---|
| RF-05 | sim, com o defeito novo do §8.3 | §8.1 coerente com o §6 |
| RF-06 | sim | sem número de produto nos blocos de prompt; `<plano>` marcado |
| RF-08 | sim, com resto | `worker.md:26-32` coerente; linha 33 contradiz o §10 |

Resolvidos, conferidos pelo verifier: os 3 CRÍTICOs da rodada 1, `review_kit_` e precedência, `kitRepairSchema`, `formatExpectedAnswer`, normalização de `independentAnswer`, `extraction_output_invalid`, extração sem refinamento, dependência F1-06 → F1-03, par de fingerprints, teste de colisão, expiração do cache, ADR-0010, Decisões e Status. Os dois pontos contestados se sustentam (PRD §7.3 exige recálculo só nas `computable`; textos do design doc são decisão do humano).

### Achados
- [CRÍTICO] `docs/pedagogy/spec-pedagogica.md:249` — a correção trocou "observe a figura" por "observe" sozinho no `figure_reference` (bloqueador) — casa com "observe a tabela" e "observe o trecho", que o próprio prompt pede; bloqueador falso gasta a regeneração — listar só expressões com o objeto ausente e pôr exceções testadas no §8.4; conferir "a imagem" ("imagem poética").
- [ALERTA] spec §2 e §8.3 — conteúdo proibido saiu do Zod, mas `markup_forbidden` ficou aviso e nada exige escapar o texto no render — bloqueador com reparo `item` ou regra de escape no §8.6 e no `pdf-render.md`.
- [ALERTA] `.claude/rules/worker.md:33` — "bloqueador em qualquer etapa usa a regeneração" contradiz o reparo `não` e a segunda tentativa própria do render.
- [ALERTA] `docs/engineering/jobs.md:89` e `:44` — `ai_output_invalid` ainda cita `studyKitSchema`; `generation_blocked` sem os códigos de defesa; fluxograma sem o ramo `F → X` da defesa.
- [ALERTA] `.claude/rules/ai-pipeline.md:13` — `generationVersion` "no kit e em `ai_call`" contradiz o §1 (`ai_call.prompt_version` com a versão da etapa).
- [ALERTA] `unsupported.ts` — tirar "producao de textos" deixou passar a forma plural, nome BNCC da prática; o `plan` não tem `reasonCode` para escrita livre.
- [SUGESTÃO] spec §8.7 — dizer quais códigos dependem da regra do assunto.

### Regressão pedagógica
Pendente, como na rodada 1.

### Resposta do orquestrador
Corrigido depois da rodada 2 (`fix` seguinte a `137dd8a`):
- CRÍTICO: `figure_reference` lista só expressões com verbo ou posição junto do objeto ausente; "observe" e "imagem" sozinhos nunca casam; exceções explícitas no §8.4 ("observe a tabela/o texto/o trecho/a frase/o verso/a palavra", "figura de linguagem", "imagem poética"), cada uma com teste de falso positivo na F1-03; o prompt `generate` diz que pode pedir para observar a tabela ou um trecho do texto-base.
- `markup_forbidden` vira bloqueador com reparo `item`, e o §8.6 e o `pdf-render.md` passam a exigir que todo texto do kit entre escapado, com só os trechos `\( \)` pelo KaTeX.
- `worker.md:33` restrito a plano, validação e revisão, citando o reparo `não` e a tentativa própria do render.
- `jobs.md`: `ai_output_invalid` com os schemas de cada etapa; `generation_blocked` com os códigos de defesa; ramo `F → X` no fluxograma.
- `ai-pipeline.md`: `generationVersion` no kit, versão da etapa em `ai_call.prompt_version`.
- "producao de textos" volta à lista; o teste de colisão aceita `lp7-verb-moods` como colisão documentada (decisão no `spec.md`); `open_writing` entra no `reasonCode` do `plan` e no prompt.
- §8.7 diz que só `unit_missing` depende da regra.

Teto de 2 rodadas atingido (`gizito-spec-driven`): estas correções não passaram por verifier neutro. Escalado ao humano.

## Rodada 3 (pedida pelo humano; revalidação do diff `137dd8a..a5cc92f`)

### Comandos executados
| Comando | Resultado |
|---|---|
| `git diff 137dd8a..a5cc92f` | 12 arquivos lidos inteiros |
| `bun test` (core) | 347 pass, 0 fail |
| `bun -e` com regex ingênuas de marcação | `\p{Emoji}` casa dígitos e "°C"; regra de tag casa "use <, > ou ="; `__` casa lacuna "______" |

### Critérios de aceite
| RF | Atendido | Evidência |
|---|---|---|
| RF-02, RF-03 | sim | "produção de textos" → `lp-essay-writing`; colisões aceitas registradas; fingerprint trocado antes do merge |
| RF-05 | falta o `figure_reference` | §8.3 contra §8.4; demais pontos da rodada 2 resolvidos |
| RF-06 | sim | linhas novas sem número; `reasonCode` igual ao §6 |
| RF-08 | sim | `worker.md:33`, `jobs.md` e `ai-pipeline.md:13` batem com a spec |

### Achados
- [CRÍTICO] `spec-pedagogica.md:249` contra `:265` — a lista do §8.3 manteve "página 12", "do seu livro/apostila/caderno" sem verbo, contra a regra do §8.4; o prompt só proíbe pedir para observar, então "leu 15 páginas do seu livro", "parou na página 48" e "12 folhas do seu caderno" passam no prompt e bloqueiam no validador; "na figura" casa "na figura descrita" e "na figurinha" — lista fechada de comandos, palavra inteira, resto para `review_missing_data`, testes de falso positivo.
- [ALERTA] `spec-pedagogica.md:260` — `markup_forbidden` virou bloqueador sem padrão no §8.4; padrões ingênuos casam dígitos, "°C", "<" de comparação e lacuna — definir os padrões e os testes de falso positivo; dizer no prompt como escrever lacuna.
- [ALERTA] `prompts-v1.md:27` — reparo de código determinístico chega ao modelo sem nota (`- p3: figure_reference —`) — descrição fixa do core e trecho que casou.
- [SUGESTÃO] `reasonCode` sem oralidade e com nomes diferentes de `unsupportedTopicReasonList`.
- [SUGESTÃO] `worker.md:21` — "contam como a única regeneração" ignora o reparo `não`.
- [SUGESTÃO] `spec-pedagogica.md:297` — `unit_missing` não roda no "outro"; registrar.

### Regressão pedagógica
Pendente, como nas rodadas anteriores.

### Resposta do orquestrador
Tudo corrigido:
- CRÍTICO: `figure_reference` vira lista fechada de comandos no §8.4 (verbo + objeto visual; objeto visual + "abaixo/acima/ao lado"; "veja/abra/consulte/copie" + livro, apostila ou caderno; "na página N do livro/da apostila"), casada como expressão inteira; nada fora dela bloqueia, e o resto fica com `review_missing_data`. Os três enunciados do achado, "na figura descrita" e "figurinhas" entram como testes de falso positivo obrigatórios.
- `markup_forbidden`: padrões definidos no §8.4, fora dos trechos `\( \)`, com `\p{Extended_Pictographic}` em vez de `\p{Emoji}`, `**`/`__` só colados a letra e tag só com letra depois de `<`. Conferido com `bun` num script fora do repositório: nenhum falso positivo em lacuna, "use <, > ou =", "3 < 5 e 7 > 2", "25 °C", números e "R$ 12,50"; pega `**`, `__`, `#`, link, crase, tag e emoji. O prompt `generate` diz como escrever lacuna.
- Reparo: `ValidationIssue` ganha `excerpt` (trecho que casou, até 80 caracteres, nunca em log) e o core ganha `validationIssueDescriptionMap`; a linha de reparo leva descrição, trecho e nota.
- `reasonCode` = `figure`, `orality`, `open_writing` (os de `unsupportedTopicReasonList`) + `beyond_grade`, `other_subject`, `not_a_school_topic`, no §6 e no prompt `plan`.
- `worker.md:21` remete à regeneração por reparo.
- §8.7 registra que `unit_missing` não roda no "outro" e o que ainda pega unidade errada nele.

### Ajuste pós-rodada 3 (pedido pelo humano, 20/10/2026)
Ao explicar a lista de figura ao humano, o orquestrador achou dois falsos positivos que a correção da rodada 3 ainda deixava passar: "Júlia parou na página 48 do livro" (o item "na página N do livro/da apostila" casava narrativa) e "Lucas pendurou o desenho ao lado da janela" (objeto visual + posição seguido de complemento). O humano pediu a correção:
- o item de página saiu da lista; ordem de página vem com "veja/abra/consulte/copie", que já é pego;
- objeto visual + "abaixo/acima/ao lado" não casa quando a posição é seguida de "de/da/do/das/dos";
- as duas frases, "Ana leu até a página 30 da apostila" e "a imagem acima da porta era antiga" entram nos testes de falso positivo; o §8.4 ganhou testes obrigatórios de acerto.
Conferido com `bun` num script fora do repositório: 11 comandos pegos, 15 frases de falso positivo sem casar. Sem verifier.

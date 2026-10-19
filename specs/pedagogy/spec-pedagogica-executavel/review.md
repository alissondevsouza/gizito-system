---
feature: F1-02 spec-pedagogica-executavel
module: pedagogy
round: 1
verdict: REPROVADO
updated: 2026-10-19
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

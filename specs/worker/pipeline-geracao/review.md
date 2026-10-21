---
feature: pipeline-geracao
module: worker
round: 1
verdict: APROVADO
updated: 2026-10-21
---

# Review: pipeline-geracao (F1-07)

## Rodada 1

### Comandos executados
| Comando | Resultado |
|---|---|
| `bun run --cwd apps/worker test` (verifier) | 180 pass, 26 skip, 0 fail |
| `bun run --cwd packages/integrations test` (verifier) | 363 pass, 16 skip, 0 fail |
| `bun run --cwd packages/core test` (verifier) | 724 pass, 0 fail |
| `bun run --cwd apps/worker test:integration` (verifier) | 17 pass, 0 fail |
| `bun run lint`, `bun run typecheck` (orquestrador, `463c978`) | limpos |
| `bun run --cwd apps/worker test:generate-live` (orquestrador, rodada final) | 10 de 10 kits prontos, 3 com reparo por item, de US$ 0,30 a 0,65 por pedido (média 0,41), de 148 a 356 s |
| Mutações numa cópia (verifier): 12 no `generate.ts`, 10 nos prompts | 11 e 6 derrubadas; as sobreviventes viraram os achados abaixo |

### Critérios de aceite
| RF | Atendido | Evidência (teste ou arquivo) |
|---|---|---|
| RF-01 | sim | `src/__tests__/pipeline/prompts/kit-prompts-v1.test.ts` (texto igual ao doc, sem `{{`, system estável, dado limpo e cortado, uma tag por bloco, outro como pedido) |
| RF-02 | sim | `packages/integrations/src/__tests__/katex/markup.test.ts`, `apps/worker/src/__tests__/pipeline/math-markup.test.ts` |
| RF-03 | sim | `generate.test.ts` "kit de %s sai com plan, generate e review, sem imagem" |
| RF-04 | sim | `generate-blockers.test.ts` (todo bloqueador fora do render) e `generate.test.ts` (revisão parcial e completa, mais de 8 itens, falhas na segunda tentativa, outro inviável) |
| RF-05 | sim | `generate.test.ts`; o caso depois do reparo ganhou teste na resposta |
| RF-06 | sim | `generate.test.ts`; o `signal` em toda requisição ganhou teste na resposta |
| RF-07 | sim | `generate.test.ts` (`ai_rate_limited` retryable, `ai_auth_failed` não) |
| RF-08 | sim | `generate.test.ts` (teto igual ao gasto, teto baixo); valor 200 justificado na spec |
| RF-09 | sim | `generate.test.ts` (3 e 5 registros, `onAiCall` igual à lista) |
| RF-10 | sim | saída do live em `tests/pedagogy/output/f1-07-generate-live/2026-10-21T15-03-17-614Z/` (fora do git); tempo e teto no known-issues |

### Achados
- [ALERTA] `apps/worker/src/pipeline/generate.ts:192` — tirar o `signal` da `AiRequest` deixava a suíte verde. Com o `fetchWithoutIdleTimeout`, o `signal` passou a ser o único limite do stream depois dos cabeçalhos — teste que confira o `signal` em todas as requisições.
- [ALERTA] `apps/worker/src/__tests__/pipeline/generate.test.ts:311` — o aceite do RF-05 "a nova chamada vale também na revisão depois do reparo" não tinha teste.
- [ALERTA] `apps/worker/src/pipeline/generate.ts:345` — a junção da revisão parcial mantinha o aviso anterior do kit, e o revisor parcial podia marcá-lo de novo: `review_kit_style_mismatch` saía duplicado em `qualityCheckList` — `uniqueByCodeAndItem` na junção, com teste.
- [SUGESTÃO] `kit-prompts-v1.test.ts:239` — o caso hostil não cobria `{{REVIEW_SECTIONS}}`, o `trecho` do reparo nem o foco do exemplo.
- [SUGESTÃO] `generate.ts:154`, `kit-context.ts:23` — a regra de qual código vira `ai_output_invalid` depois da regeneração e os rótulos `questionTypeLabelMap` estavam no app; regra de domínio e rótulos ficam no core.
- [SUGESTÃO] `packages/integrations/src/ai/runtime-fetch.ts:11` — quem chamar o pipeline sem `signal` (CLI da F1-09, runner da F1-10) fica sem limite depois dos cabeçalhos — passar `AbortSignal.timeout(JOB_MAX_RUN_SECONDS * 1000)` nessas features.

### Regressão pedagógica
Pendente: `bun run test:pedagogy` só existe na F1-10. Os prompts `plan`, `generate` e `review` v1, o validador `checkMathMarkup` e o schema do exemplo resolvido entraram sem ela. A pendência está registrada no known-issues (entrada da regressão). A prova contra o modelo real é o `test:generate-live`: 10 de 10 kits na rodada final.

### Resposta do orquestrador
Todos os achados foram aceitos:
- os três ALERTAs foram corrigidos, com testes. Sem o `uniqueByCodeAndItem`, o teste do aviso duplicado falha;
- o caso hostil passou a cobrir seções de revisão, trecho e nota do reparo e foco do exemplo;
- `questionTypeLabelMap` e `failReasonAfterRegeneration` foram para o core (`labels.ts`, `repair.ts`), com teste;
- o `signal` para o CLI e o runner virou known-issue LOW, a resolver na F1-09 e na F1-10.

Suíte depois das correções: core 725, integrations 363, worker 183, db 98, api 25 e web 10, sem falha; lint e typecheck limpos. Não houve CRÍTICO, então não há rodada 2.

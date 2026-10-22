---
feature: job-analise
module: worker
round: 1
verdict: REPROVADO
updated: 2026-10-22
---

# Review: job-analise (F2-02)

## Revisão da spec (antes da implementação)

`gizito-spec-verifier`, rodada 1: **APROVADO**, sem CRÍTICO. Os 4 ALERTAs e as sugestões foram incorporados à spec antes do código:
- `analysis_unavailable` e `skip` fecham o job com `completeWithin`;
- o RF-12 usa duas fotos;
- a análise ganhou prazo de retenção;
- os desfechos do fim ficaram definidos;
- o `workJob` relê a tentativa;
- a ordem das travas foi fixada;
- a troca de foto limpa as notas.

O registro está na tabela de Decisões da spec.

## Rodada 1

### Comandos executados
| Comando | Resultado |
|---|---|
| `bun run lint` | limpo, 413 arquivos (rodado pelo implementador) |
| `bun run typecheck` | 6 de 6 workspaces (implementador) |
| `bun run test` | 6 de 6 verdes (implementador) |
| `bun run test:integration` | db 161, worker 54, api 38, integrations 6 (implementador) |
| `bun test src/__tests__/integration/order-analyze.test.ts` (worker) | 17 pass |
| teste descartável com `completeWithin` neutralizado no handler | 3 pass: as asserções da corrida continuam verdes sem a lógica |
| RF-12 com a IA real | evidência do implementador (spec, Status); não reproduzido pelo revisor, porque exige a chave |

### Navegador
Não aplicável (o `apps/web` não foi tocado).

### Critérios de aceite
| RF | Atendido | Evidência (teste ou arquivo) |
|---|---|---|
| RF-01 | sim | contrato no fake e no MinIO; unit do R2 com 404, 403, 429, 500, rede e corpo interrompido |
| RF-02 | sim | `packages/db/src/__tests__/integration/extraction-cache.test.ts` |
| RF-03 | sim | `packages/core/src/__tests__/order/analysis.test.ts`; `order-analysis.test.ts` do db, com o check |
| RF-04 | sim | `decideAnalysisStart` nos 9 estados; integração de `start`, `resume` e `skip` |
| RF-05 | não | o teste da troca logo depois do fim passa sem `completeWithin` |
| RF-06 | sim | `queue-complete-within.test.ts` |
| RF-07 | não | mesma falha do RF-05 em `analysis_unavailable` e `skip`; `skip` em `preview_ready` só testado no db |
| RF-08 | sim | retentativas esgotadas, `lock_expired` na varredura e no-op fora de `analyzing` |
| RF-09 | sim | integração da api em `draft` depois da falha e em `preview_ready` |
| RF-10 | sim | unit da view; integração nos três casos, sem texto do material |
| RF-11 | sim | `config.test.ts` e `health.test.ts` |
| RF-12 | sim | pela evidência do implementador |

### Achados
- [CRÍTICO] `apps/worker/src/__tests__/integration/order-analyze.test.ts:284, 328, 361, 419, 480` — os testes de aceite do RF-05 e do RF-07 que provariam o fechamento da corrida do singleton passam com a lógica removida. Eles enfileiram depois que o `workJob` volta, e o `workJob` já conclui o job em todo `Ok`. Correção pedida: sondar a fila entre o fim do `handle` e o `completeJob`; somar um teste de lease roubado durante a análise.
- [ALERTA] `order-analyze.test.ts:407` — o título fala de `preview_ready`, mas o teste só exercita `draft` já analisado.
- [SUGESTÃO] `apps/worker/src/jobs/order-analyze.ts:113` — `OrderNotFoundError` no fim sai com o log "o pedido saiu de analyzing", que não é o que aconteceu.
- [SUGESTÃO] `apps/api/src/services/orders.ts:369` — análise gravada que deixe de passar no schema faz o `GET` responder 500.

### Regressão pedagógica
Não aplicável: prompt, modelo, taxonomia e validador não mudaram.

### Resposta do orquestrador
- **CRÍTICO, corrigido.** `runAnalyzeAndProbeHandoff` envolve o handler e tenta `enqueueSingletonJob` logo depois do `handle`, antes do `completeJob` do `workJob`. A sonda é exigida em `preview_ready`, nas quatro falhas da prévia, em `analysis_unavailable` e nos dois `skip`. Também entrou o teste "lease roubado durante a análise": `lease_lost`, pedido em `analyzing`, análise e notas nulas, job ainda com o outro worker. Prova por mutação: com o `completeWithin` tirado do `finish` e do `skip`, 9 dos 19 testes falham; com o arquivo restaurado, 19 de 19 passam.
- **ALERTA, corrigido.** O teste virou `it.each` com `draft` já analisado e `preview_ready`, conferindo as chamadas ao `extract`, o status mantido e a sonda.
- **SUGESTÃO do log, corrigida.** O rollback leva o código do erro. O log `warn` "análise sem efeito" traz `errorCode` (`invalid_transition` ou `order_not_found`), e o teste confere `invalid_transition`.
- **SUGESTÃO do 500, contestada.** Tratar a análise inválida como pendente não resolve `preview_ready`, cuja view exige assuntos: o `GET` daria 500 do mesmo jeito. Em `draft`, a tela ficaria em "carregando" para sempre, sem nenhum job. Um 500 alto e com log é melhor que uma prévia errada em silêncio. A regra entrou no `data-model.md` §5: mudança que estreite o `orderAnalysisSchema`, o `mergedExtractionSchema` ou a taxonomia migra ou limpa as análises gravadas no mesmo deploy, como já vale para o `study_kit`.
- Depois da correção: lint limpo; worker com 343 unit e 56 de integração verdes.

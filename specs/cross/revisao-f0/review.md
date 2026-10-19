---
feature: revisao-f0
module: cross
round: 1
verdict: APROVADO
updated: 2026-10-19
---

# Review: revisao-f0

## Rodada 1

Revisor: `gizito-implement-verifier` (spawn novo, só spec + diff `main...HEAD`, commits `f81d88b` a `ecdd15e`).

### Comandos executados
| Comando | Resultado |
|---|---|
| `bun run lint` (raiz) | 167 arquivos, limpo (orquestrador; não repetido pelo revisor) |
| `bun run typecheck --force` | 6/6 (orquestrador) |
| `bun run test --force` | core 254, db 98, integrations 25, api 25, worker 21, web 10; 0 falhas (orquestrador) |
| `bun run test:integration` | db 129, api 3, worker 16; 0 falhas (orquestrador) |
| `queue-lease.test.ts` + `queue.test.ts` 3 vezes; worker 3 vezes | 47/47 e 36/36 nas três (orquestrador) |
| `bun run dev` com banco descartável migrado | api e worker `/health` 200, web `/` 200 e rota desconhecida 404 (orquestrador) |
| Sonda com 200 mil jobs `completed` | claim no `job_pending_name_run_after_datetime_idx`; `getQueueMetrics` ~1 ms (orquestrador) |
| `bun -e` no core (revisor) | `createdChargeSchema` e `notificationAttachmentSchema` recusam `javascript:` e aceitam `https` |
| `drizzle-kit generate` num diretório temporário (revisor) | negado pela permissão; não executado |

### Critérios de aceite
| RF | Atendido | Evidência (teste ou arquivo) |
|---|---|---|
| RF-01 | sim | `core/__tests__/order/state-machine.test.ts`: 15 transições, demais inválidas, `postPaymentOrderStatusList` igual |
| RF-02 | sim | `core/__tests__/jobs/rules.test.ts`: códigos em `outcomeCodeSchema`, renovação × 3 ≤ lock |
| RF-03 | sim | `core/__tests__/jobs/schemas.test.ts` |
| RF-04 | sim | `core/__tests__/order/schemas.test.ts`: repetido, 3 + outro, `paid` com 0 e só com "outro", `draft` com 0 |
| RF-05 | sim, com ressalva | código recusa nos três; faltava o teste do `createdChargeSchema` (ALERTA 3) |
| RF-06 | sim | `core/__tests__/retention/rules.test.ts`: borda e pior caso |
| RF-07 | sim | `core/__tests__/interfaces/contracts.test.ts`: dois ramos, `whatsapp_help` com pedido ou por e-mail recusado |
| RF-08 | sim | `db/__tests__/integration/queue-lease.test.ts` "renewJobLease" |
| RF-09 | sim | mesmo arquivo: `attemptCount` preservado e lock intacto depois do reclaim |
| RF-10 | sim, com ressalva | renovação, `lease_lost`, `job_timeout`, `released`, precedência e código inválido; spec contraditória no `retryable` do código inválido (ALERTA 2) |
| RF-11 | sim | chamado só na última falha e no lock esgotado; não em não retryable; rollback da sonda; envenenado não trava os outros; `payload_invalid` sem callback |
| RF-12 | sim | `db/__tests__/integration/migration.test.ts`: 3 parciais e ausência dos antigos |
| RF-13 | sim | `charge.test.ts`, `order.test.ts`, `migration.test.ts` |
| RF-14 | sim | `webhook-and-notification.test.ts` |
| RF-15 | sim | `db/__tests__/integration/health.test.ts`: `SHOW`, 57014, `DatabaseTimeoutError` (teto de 200 ms no teste) |
| RF-16 | sim | `worker/__tests__/runner/lanes.test.ts` e `config.test.ts` |
| RF-17 | sim, com ressalva | runner libera no `stop` e chama `onExhausted`; o despacho por nome na manutenção não tinha teste (ALERTA 4) |
| RF-18 | sim | testes de config e boot de core, api e worker; scripts `dev` |
| RF-19 | sim | `integrations/__tests__/log-error.test.ts` e `logger.test.ts` |
| RF-20 | sim | `api/__tests__/app.test.ts`; integração com segunda instância na mesma porta recusada |
| RF-21 | sim | `web/__tests__/routes/route-error.test.tsx` |
| RF-22 | sim, com ressalva | `api.md` §6 ainda com default de `NODE_ENV` (ALERTA 1) |

### Achados
- [ALERTA] `docs/engineering/api.md:77` — §6 ainda dizia que `NODE_ENV` tem default `development` — deploy guiado pelo doc falharia no boot — listar `NODE_ENV` entre as obrigatórias
- [ALERTA] `packages/db/src/queue/work.ts:147` — código inválido com `retryable: false` continua não retryable, mas o RF-10 dizia "retryable" — spec contraditória com o código, o `jobs.md` e o teste — registrar a decisão e ajustar o RF-10
- [ALERTA] `packages/core/src/__tests__/interfaces/contracts.test.ts:70` — nenhum teste tenta `javascript:` no `createdChargeSchema` — voltar a `z.url()` passaria verde — acrescentar a asserção
- [ALERTA] `apps/worker/src/runner/lanes.ts:65` — `buildExhaustedJobDispatcher` sem teste com dois `onExhausted` — despacho para o job errado passaria verde — testar com dois callbacks ou manutenção com o mapa de dois jobs
- [SUGESTÃO] `packages/db/src/schema/order.ts:48` — o `AND` do check não garante ordem de avaliação; string JSON poderia dar 22023 em vez de 23514 — usar `CASE WHEN ... THEN ... ELSE false END`
- [SUGESTÃO] `packages/db/src/queue/work.ts:119` — `onLeaseRenewError` que lança vira rejeição não tratada — `try/catch` ou documentar que não pode lançar
- [SUGESTÃO] `packages/db/src/health.ts:15` — `withDatabaseTimeout` só para de esperar; a consulta segue na fila do pool até o `connectionTimeout`/`statement_timeout` — aceitável; registrar se o health check do deploy for agressivo
- [SUGESTÃO] `apps/worker/src/__tests__/integration/scheduler.test.ts:9` — `const` entre blocos de import — mover para depois dos imports

### Regressão pedagógica
Não aplicável: nenhum prompt, modelo, taxonomia ou validador tocado.

### Resposta do orquestrador
Veredito aceito. Aplicado no commit de fechamento:
- **ALERTA 1:** `api.md` §6 lista `NODE_ENV` como obrigatória (os scripts `dev` fixam `development`). O parágrafo do logger também foi atualizado: qualquer `Error`, chaves sensíveis em qualquer profundidade, sem query nem params do Drizzle.
- **ALERTA 2:** RF-10 corrigido ("mantendo o `retryable` do handler") e a decisão entrou na tabela de Decisões.
- **ALERTA 3:** `contracts.test.ts` recusa `javascript:` e `http:` no `createdChargeSchema`.
- **ALERTA 4:** `scheduler.test.ts` ganhou a manutenção com `buildExhaustedJobDispatcher` sobre um mapa com dois `onExhausted` e um job sem callback. Só o do nome esgotado é chamado. O teste unit com transação falsa foi descartado porque exigiria `as` no tipo.
- **SUGESTÃO do `CASE`:** aplicada. A `0002_revisao_f0` foi regerada em vez de ganhar uma `0003`, porque só rodou em bancos descartáveis: o `gizito` local tem `0000` e `0001` em `drizzle.__drizzle_migrations`, conferido em 19/10/2026.
- **SUGESTÃO do `onLeaseRenewError`:** contrato documentado na spec e no `jobs.md`: o callback só loga e não pode lançar. O do runner é um `logger.warn`.
- **SUGESTÃO do `withDatabaseTimeout`:** aceita como está; o acúmulo é limitado pelo `connectionTimeout` de 5 s e pelo `statement_timeout` de 30 s.
- **SUGESTÃO do import:** aplicada.

Revalidação: `bun run lint`, `typecheck --force`, `test --force` (core 254, db 98, integrations 25, api 25, worker 21, web 10) e `test:integration` (db 129, api 3, worker 17) verdes na raiz. Sem CRÍTICO, sem rerodada.

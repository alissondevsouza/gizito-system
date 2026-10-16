---
feature: F0-06 fila-postgres
module: db
round: 1
verdict: APROVADO
updated: 2026-10-15
---

# Review: F0-06 fila-postgres

## Rodada 1

Revisor: `gizito-implement-verifier` (spawn novo, só spec + diff `main...HEAD`, commits `62facd6`, `db5e365`, `b7cdb5a`, `70d9d60`, `be1f89c`).

### Comandos executados
| Comando | Resultado |
|---|---|
| `git diff main...HEAD` | 5 commits, 57 arquivos, lidos contra spec, CLAUDE.md, rules `database`, `testing`, `payments`, `worker`, `privacy-security` e ADR-0008 |
| `bun test` de `queue`, `mark-order-paid-and-enqueue` e `publish-kit`, 3 vezes | 51 pass, 0 fail nas 3 rodadas (concorrência estável) |
| Sondagem própria num banco `gizito_test_*` descartável | jsonb: `null` vira NULL, `[]` vira `array`, aninhados certos; claim é um único `UPDATE ... = ((select ... for update skip locked))`; duas cobranças do mesmo pedido confirmadas juntas dão `paid` + `duplicate_payment`, 1 job e 1 ticket; `gateway_payment_id` de outra cobrança lança unique |
| Mutação numa cópia: sem o `FOR UPDATE` do pedido em `markOrderPaidAndEnqueue` | os 15 testes de pagamento continuam verdes; a sondagem dá `deadlock detected` (40P01) |
| `psql` só leitura no banco `gizito` do compose | sem `drizzle.__drizzle_migrations`: a `0001_fila` nunca foi aplicada fora de bancos descartáveis |
| `bun run lint`, `typecheck`, `test`, `test:integration`, `drizzle-kit generate` (raiz) | não repetidos; aceitos do orquestrador (último commit só toca docs) |

### Critérios de aceite
| RF | Atendido | Evidência (teste ou arquivo) |
|---|---|---|
| RF-01 | sim | ADR-0008 com a tabela do spike, alternativas e linha no `docs/README.md`; números não reproduzíveis pelo repo |
| RF-02 | sim | `core/__tests__/jobs/rules.test.ts`, `state-machine.test.ts` (`postPaymentOrderStatusList`), `charge/schemas.test.ts`, `kit/schemas.test.ts` |
| RF-03 | sim | `0001_fila.sql` com índices, 3 checks e trigger; `conventions.test.ts` (9 tabelas), `enums.test.ts` (15), `migration.test.ts` (19 índices, unique parcial, trigger, no-op); `queue.test.ts` testa o check de `name` em 3 casos |
| RF-04 | sim | `queue.test.ts`: payload inválido não insere, rollback e commit, singleton |
| RF-05 | sim | `queue.test.ts`: ordem, job futuro e nome fora da lista, 20 claims sobre 10 jobs, payload inválido por SQL cru |
| RF-06 | sim | `queue.test.ts`: 30/120/480 s e `failed` na 4ª, não transitória, lock vencido e lease antigo, payload pessoal reduzido |
| RF-07 | sim | `queue.test.ts`: fila vazia, ok, falha transitória e definitiva, exceção |
| RF-08 | sim, com ressalva | `mark-order-paid-and-enqueue.test.ts` cobre cada ramo, repetição, 4 confirmações concorrentes, Pix pago após expirar, rollback e erros sem escrita; a trava do pedido não tinha teste (ALERTA 1) |
| RF-09 | sim | `publish-kit.test.ts`: processing → ready, refunded/paid/failed, já ready, keys inválidas, rollback |
| RF-10 | sim | `src/index.ts` exporta `order` e `queue`; `truncateAllTables` cobre `job` pelo `tableList` |
| RF-11 | sim, com ressalva | docs atualizados, contadores do roadmap 5/1/1; texto do ADR com nome errado (ALERTA 2) |
| RF-12 | sim | `jsonb_typeof` em `order.test.ts`, `kit-and-ai-call.test.ts` e `queue.test.ts`; convenção exige `PgCustomColumn` |

### Achados
- [ALERTA] `packages/db/src/order/mark-order-paid-and-enqueue.ts:49-53` e `publish-kit.ts:33-37` — nenhum teste prova o `FOR UPDATE` do pedido; sem ele, Pix antigo e novo confirmados juntos dão deadlock e dois `publishKit` paralelos gravam dois kits — testes concorrentes com duas cobranças distintas e com dois `publishKit`
- [ALERTA] `docs/engineering/adr/0008-fila-propria-skip-locked.md:32` — diz que `enqueueJob` devolve `null` com a mesma chave; quem faz isso é `enqueueSingletonJob`; ADR aceito é imutável depois do merge — corrigir antes
- [SUGESTÃO] `mark-order-paid-and-enqueue.ts:76-84` — `gateway_payment_id` já em outra cobrança vira exceção de unique depois do UPDATE do pedido, contra o "antes de qualquer escrita" do `data-model.md` — checar em `lockPaymentTarget` e devolver erro tipado
- [SUGESTÃO] `packages/db/src/queue/work.ts:23,68` — `cause` carrega a exceção crua do handler (invariante 9) — manter fora de log acima de `debug` e registrar para F0-07
- [SUGESTÃO] `docs/engineering/jobs.md:65` — `payload_invalid` listado como motivo de `generation_failed` + `kit_failed`, mas o claim falha o job sem chamar handler e o pedido fica parado sem aviso — alinhar o texto ou prever alerta em F0-07
- [SUGESTÃO] `specs/db/fila-postgres/spec.md:21-22` — RF-06 e RF-07 descrevem assinaturas antigas (`failJob(executor, jobId, ...)`, handler `{ ok }`, sem `lease_lost`) — atualizar
- [SUGESTÃO] `schema/job.ts:34` e `queue/claim.ts:43` — `run_after_datetime` por default usa o `now()` do banco e o claim compara com o relógio do processo — usar um relógio só
- [SUGESTÃO] `packages/db/src/queue/error-codes.ts:1` — códigos citados em `jobs.md` e comparados pelo worker; pela convenção, mover para o core
- [SUGESTÃO] `mark-order-paid-and-enqueue.test.ts:208` — nome diz "duas confirmações" e roda quatro

### Regressão pedagógica
Não aplicável: nenhum prompt, modelo, taxonomia ou validador tocado.

### Resposta do orquestrador
Veredito aceito. Aplicado no commit de fechamento:
- ALERTA 1: `mark-order-paid-and-enqueue.test.ts` ganha "Pix antigo e Pix novo do mesmo pedido confirmados juntos" (espera `paid` + `duplicate_payment`, 1 job, 1 ticket) e `publish-kit.test.ts` ganha "dois publishKit concorrentes" (espera 1 ok, 1 `InvalidTransitionError`, 1 kit, 1 job). Mutação conferida pelo orquestrador: sem o `FOR UPDATE` do pedido nos dois services, os dois testes falham (deadlock 40P01 e dois kits); restaurado.
- ALERTA 2: ADR-0008 corrigido antes do merge (`enqueueSingletonJob` devolve `null`; `enqueueJob` sempre insere).
- `GatewayPaymentInUseError` (db) devolvido por `lockPaymentTarget` antes de qualquer escrita, com teste; `data-model.md` §6 registra que só a corrida entre checagem e escrita cai no unique, com rollback.
- `cause`: mantido no retorno de `workJob` para diagnóstico; `jobs.md` §4, `progress/db.md` e a spec registram que só vai para log em `debug` e que o loop de F0-07 loga só `jobId`, `name`, `attemptCount`, `outcome` e `errorCode`.
- `jobs.md` §4: `payload_invalid` sai da lista de `generation_failed`; o texto diz que é falha da fila, sem mudar o pedido nem notificar, com alerta por job `failed` previsto para F0-07.
- Spec: RF-06 e RF-07 com as assinaturas reais, `Result` do core e `lease_lost`.
- Relógio: `enqueueJob` sem horário grava `run_after_datetime` com o relógio do processo; `run_after`, lock e retry usam o mesmo relógio do chamador. O default `now()` do banco fica só para SQL cru.
- `jobErrorCodeMap` movido para `packages/core/src/jobs/rules.ts`, com teste de formato (`outcomeCodeSchema`).
- Nome do teste corrigido para "confirmações concorrentes do mesmo pagamento geram um job só".

Achado do orquestrador na revalidação: o teste de F0-05 "trigger atualiza update_datetime" falhou em 4 de 6 rodadas da suíte completa, porque o `Date` do JavaScript trunca para milissegundo e o insert e o update caíam no mesmo milissegundo. O teste passa a inserir uma data antiga explícita e exigir que o UPDATE a sobrescreva; 5 rodadas seguidas verdes.

Não aplicado: nada. A sugestão de `cause` foi aplicada como registro (log só em `debug` em F0-07), não como remoção do campo, porque a causa é o único rastro de um `unhandled_error`.

Revalidação: `bun run lint`, `typecheck`, `test` (core 212, db 98) e `test:integration` (db 95) verdes na raiz. Sem CRÍTICO, sem rerodada.

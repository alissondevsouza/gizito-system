# ADR-0008: Fila própria com `FOR UPDATE SKIP LOCKED`, não pg-boss

**Data:** 2026-10-15
**Status:** aceito
**Decidido por:** Alisson

## Contexto

O ADR-0003 decidiu que a fila de jobs vive no PostgreSQL da aplicação e deixou para o spike de F0-06 a escolha entre pg-boss e uma fila própria com `FOR UPDATE SKIP LOCKED`. O roadmap (§1.2) apontava o risco de o pg-boss não rodar bem no Bun. Requisitos que a escolha precisa atender: enfileirar na mesma transação que muda o estado do pedido (invariante 2, `markOrderPaidAndEnqueue` e `publishKit`), payload validado por `jobPayloadSchema` ao enfileirar e ao consumir, retry com backoff só para falhas transitórias, dead letter visível ao admin, lock por nome para o agendador com mais de uma réplica (`jobs.md` §5) e nenhum dado pessoal em payload depois do processamento (o de `whatsapp.inbound` carrega telefone e texto).

Spike em 15/10/2026, Bun 1.3.11, pg-boss 12.38.0, Postgres 16 do compose, banco descartável:

| Medida | Resultado |
|---|---|
| `start()` com o pool `pg` embutido | 139 ms (instalação do schema no primeiro start) |
| `start()` com `fromBunSql` (Bun.SQL, sem pool `pg`) | 103 ms; `stop()` em 5 ms |
| Latência de consumo com `pollingIntervalSeconds: 0.5` | ~0,5 s do `send` ao handler |
| `send` com `fromDrizzle(tx, sql)` dentro de `db.transaction` do `drizzle-orm/bun-sql` | rollback deixa 0 jobs; commit é consumido em ~0,5 s |
| Objetos criados | schema `pgboss` com 13 tabelas (inclui partições diárias de `queue_stats`) e 6 funções; `job` com 37 colunas (`id`, `created_on`, `state`, ...) |
| `send` para fila não criada | lança `Queue ... does not exist`: toda fila precisa de `createQueue` no boot |
| `policy: "singleton"` + mesmo `singletonKey`, dois `send` | os dois jobs ficam `created`; a política limita só os ativos |
| Dependências | `pg` obrigatório (+23 pacotes no `node_modules`) mesmo usando `fromBunSql` |

Conclusão do spike: **o pg-boss roda bem no Bun**, inclusive sobre Bun.SQL e dentro de uma transação do Drizzle. O risco do roadmap não se confirmou; a decisão é por encaixe, não por compatibilidade.

## Decisão

A fila é uma tabela `job` própria em `packages/db`, nas convenções do projeto e no mesmo fluxo de migration (`0001_fila`). Enfileirar é `INSERT` com o `Executor` do chamador (banco ou transação); consumir é um único `UPDATE ... WHERE job_id = (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING`. Retry, lock e singleton são explícitos:

- **Tentativas:** 4 (a primeira e 3 retentativas com 30 s, 120 s e 480 s), regra pura no core (`JOB_RETRY_DELAY_SECONDS_LIST`, `jobRetryDelaySeconds`); falha não transitória vai direto para `failed`.
- **Lock:** `lock_expire_datetime` gravado no claim (`JOB_LOCK_TIMEOUT_SECONDS`, 15 min); `recoverExpiredJobs` devolve jobs travados de worker morto. Concluir ou falhar exige o par `(job_id, attempt_count)` do claim, para um worker atrasado não fechar a tentativa de outro.
- **Singleton:** unique parcial em `(name, singleton_key)` enquanto o job está `pending` ou `active`; `enqueueJob` com a mesma chave devolve `null`.
- **Dead letter:** a linha fica `failed` com `last_error_code`; payload inválido no consumo vai para `failed` com `payload_invalid`.
- **Dado pessoal:** ao terminar (sucesso ou falha definitiva), o payload de `whatsapp.inbound` é reduzido aos campos de `personalDataJobRetainedFieldMap` do core (`name`, `webhookEventId`).

## Alternativas Consideradas

| Alternativa | Prós | Contras |
|-------------|------|---------|
| pg-boss 12 com `fromBunSql` e `fromDrizzle` | maduro; retry, dead letter, cron, LISTEN/NOTIFY, OpenTelemetry e dashboards prontos; funciona no Bun (spike) | 13 tabelas fora das convenções (`id`, `created_on`, plural), com migrations próprias paralelas às do Drizzle; `pg` obrigatório; `createQueue` por fila no boot; semântica das políticas não óbvia (singleton aceitou dois jobs pendentes); payload pessoal exige `deleteAfterSeconds` ou SQL direto nas tabelas dele |
| Fila própria com `FOR UPDATE SKIP LOCKED` | uma tabela no nosso schema e no nosso migrator; `tx.insert(job)` na transação do estado sem adaptador; retry e singleton como regra testável no core; payload revalidado pelo core no consumo; sem dependência nova | cron, NOTIFY, métricas e painel ficam por nossa conta; menos horas de produção que o pg-boss |
| Graphile Worker | maduro, focado em Postgres | mesma questão de schema e migrations próprias; centrado em `pg`; sem ganho sobre o pg-boss para este caso |

## Consequências

### Positivas
- Uma migration, um migrator, um driver (Bun.SQL); `pg_dump` e `truncateAllTables` cobrem a fila sem caso especial.
- `markOrderPaidAndEnqueue` e `publishKit` usam o mesmo `enqueueJob` que qualquer outro chamador; o teste de integração prova rollback atômico.
- Comportamento de retry, lock e singleton é lido no código e no core, sem depender de documentação de terceiros.

### Negativas
- Agendamento periódico (`charge.reconcile` a cada 2 min, `retention.purge` diário) é `setInterval` no worker que chama `enqueueJob` com `singletonKey` (F0-07); não há cron persistente.
- Polling a cada poucos segundos, sem LISTEN/NOTIFY (aceito no ADR-0003).
- Métricas da fila (tamanho, idade do job mais antigo, taxa de `failed`) são consultas próprias, a escrever com o `/health` do worker.

### Riscos
- Bug de concorrência no claim: mitigado por teste de integração com claims concorrentes sobre o Postgres real.
- Job mais longo que o lock (15 min) seria recuperado e rodaria duas vezes: os handlers são idempotentes pelo estado do pedido e o par `(job_id, attempt_count)` impede o worker atrasado de concluir; se a geração passar a levar mais que isso, renovar o lock durante o job.
- Tabela cresce com jobs `completed`: expurgo entra com `retention.purge` (F2-06).

## O que faria esta decisão mudar

- Precisar de cron persistente, fluxos com dependência entre jobs, prioridade ou fan-out que a tabela própria não cubra em poucas linhas: migrar para pg-boss, que já se provou no Bun neste spike.
- Volume em que o polling ou o `SKIP LOCKED` sobre uma tabela única apareçam em latência ou CPU (o mesmo gatilho do ADR-0003).

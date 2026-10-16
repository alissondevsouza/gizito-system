# Progresso: db

**Workspace:** `@gizito/db`
**Fase atual:** F0 — Fundação
**Última atualização:** 2026-10-16

## Feature repo-e-monorepo (2026-10-14, `8d2509c`)

- Workspace criado com `package.json` (`imports` `#src/*`, `exports` apontando para `src/index.ts`, dep `@gizito/core`), `tsconfig.json` estendendo `tsconfig.base.json`, `src/index.ts` vazio e um teste de resolução de imports em `src/__tests__/`. Runner: bun test.

## Feature db-fundacao (2026-10-15, `5f2b6a3`)

- `src/schema/`: 13 `pgEnum` com valores das listas do core (`enums.ts`); tabelas `order`, `order_photo`, `charge`, `kit`, `ai_call`, `webhook_event`, `notification`, `support_ticket` (um arquivo por tabela), `timestamps.ts` com `datetime()` e `timestampColumnMap`, `relations.ts` com coleções `List`, `index.ts` com `tableList`. Índices do `data-model.md` §3, checks de domínio, FKs para `order` com `restrict` e `kit.superseded_by_kit_id` com `set null`.
- `drizzle/0000_fundacao.sql` gerada por `drizzle-kit generate` com a função `set_update_datetime()` e um trigger `BEFORE UPDATE` por tabela anexados como SQL customizado. `drizzle/meta` fora do Biome.
- `client.ts`: `createDatabase({ databaseUrl, maxConnections? })` sobre `drizzle-orm/bun-sql` (Bun.SQL), tipos `Database` e `Transaction`. `migrations.ts`: `MIGRATIONS_FOLDER` e `runMigrations(db)`. `migrate.ts`: script de `db:migrate` (lê `DATABASE_URL` com Zod), porque o `drizzle-kit migrate` não detecta o driver do Bun.
- `@gizito/db/test-helpers`: `createTestDatabase()` cria `gizito_test_<hex>` em `TEST_DATABASE_URL` (default: Postgres do compose), migra e devolve `{ db, databaseName, destroy }`; `truncateAllTables(db)`.
- Scripts: `test` (unit, ignora `integration/`), `test:integration`, `db:generate`, `db:migrate`; tasks correspondentes no Turborepo (`db:migrate` e `test:integration` declaram `env`); CI sobe o Postgres do compose e roda a integração.
- Testes: 88 unit (convenções de nome, PK, timestamps, FKs e índices via `getTableConfig`; enums × listas do core; tipos das linhas atribuíveis a `Order`, `OrderPhoto` e `Charge`; relations; journal e triggers da migration; `createDatabase` sem conexão) e 32 de integração (migração do zero e idempotente, insert e `orderSchema.parse`, uniques, FKs, checks, trigger, relations, `numeric` como número, test-helpers). Cobertura reportada, sem threshold (ver known-issues).
- Correção no core descoberta pelos testes de integração: `publicTokenSchema` aceita os 16 últimos caracteres canônicos (`66f1217`).

## Feature fila-postgres (2026-10-15, `db5e365`)

- Spike pg-boss × fila própria no scratchpad; decisão no ADR-0008 (fila própria).
- `src/schema/job.ts`: tabela `job` (`name` e `status` como `pgEnum` das listas do core, `payload` jsonb, `singleton_key`, `attempt_count`, `max_attempt_count`, `run_after_datetime`, `locked_by`, `lock_expire_datetime`, `finish_datetime`, `last_error_code`), índices `(status, name, run_after_datetime)`, `(status, lock_expire_datetime)` e unique parcial `(name, singleton_key)` para `pending`/`active`; check `payload->>'name' IS NOT DISTINCT FROM name`. Migration `drizzle/0001_fila.sql` com o trigger `set_update_datetime`.
- `src/schema/jsonb.ts`: coluna `jsonb` própria (`customType` que entrega o valor cru ao Bun.SQL). O `jsonb` do Drizzle gravava string no `bun-sql`; toda coluna `jsonb` usa a própria (teste de convenção) e os testes de integração leem `jsonb_typeof` (`62facd6`).
- `src/queue/`: `enqueueJob`, `enqueueSingletonJob`, `claimJob` (um `UPDATE` com subquery `FOR UPDATE SKIP LOCKED`; payload revalidado e inválido vai para `failed` com `payload_invalid`), `completeJob` e `failJob` pelo par `(job_id, attempt_count)`, `recoverExpiredJobs`, `workJob` (handler devolve `Result` do core; exceção vira `unhandled_error` transitório). `Executor = Database | Transaction` em `client.ts`.
- `src/order/`: `markOrderPaidAndEnqueue` e `publishKit` (exigem `Transaction`, travam o pedido com `FOR UPDATE`, devolvem `Result` com `OrderNotFoundError`, `ChargeNotFoundError`, `WebhookEventNotFoundError`, `GatewayPaymentInUseError`, `ChargePaymentMismatchError` ou `InvalidTransitionError`, sempre antes de escrever).
- Testes: 98 unit (convenções com 9 tabelas, 15 enums, jsonb próprio, migrations) e 95 de integração (fila com 28 casos, inclusive 20 claims concorrentes; markOrderPaidAndEnqueue com 17, inclusive confirmações concorrentes do mesmo pagamento e de Pix antigo e novo do mesmo pedido; publishKit com 9, inclusive dois concorrentes; tipo jsonb no SQL).

## Ajustes em esqueleto-das-apps (2026-10-16, `c579f79`)

- `src/health.ts`: `pingDatabase`. `src/queue/metrics.ts`: `getQueueMetrics` (prontos, idade do mais antigo pronto, ativos, falhas e `payload_invalid` na janela, numa consulta com `FILTER`, lendo só `pending`, `active` e as falhas da janela).
- `claimJob` e `workJob` aceitam `onPayloadInvalid({ jobId, name })`.
- Testes: 98 unit e 101 de integração.

## Implementado

- [x] Esqueleto do workspace, lint, typecheck e teste verdes (F0-01)
- [x] Schema das 8 tabelas, migration inicial, conexão, migrator e test-helpers (F0-05)
- [x] Tabela `job`, fila própria, `markOrderPaidAndEnqueue` e `publishKit` (F0-06)

## Pendências

- Toda tabela nova precisa do trigger `set_update_datetime` na migration (`migrations.test.ts` falha sem ele) e toda coluna `jsonb` usa `#src/schema/jsonb.ts`
- `republishKit` em F2-11 (admin); expurgo de jobs `completed` com `retention.purge` (F2-06)
- `kit.study_kit` fica `jsonb` sem tipo até `studyKitSchema` (F1-03)
- `coverageThreshold` volta ao `bunfig.toml` quando o Bun deixar de avaliar os arquivos do core importados (known-issues)

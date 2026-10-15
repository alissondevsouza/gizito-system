# Progresso: db

**Workspace:** `@gizito/db`
**Fase atual:** F0 — Fundação
**Última atualização:** 2026-10-15

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

## Implementado

- [x] Esqueleto do workspace, lint, typecheck e teste verdes (F0-01)
- [x] Schema das 8 tabelas, migration inicial, conexão, migrator e test-helpers (F0-05)

## Pendências

- F0-06: tabela da fila (ou pg-boss), `enqueue`/`work`, `markOrderPaidAndEnqueue`, `publishKit`, `republishKit`; toda tabela nova precisa do trigger `set_update_datetime` na migration (`migrations.test.ts` falha sem ele)
- F0-07: `config.ts` das apps lê `DATABASE_URL` e chama `createDatabase`
- `kit.study_kit` fica `jsonb` sem tipo até `studyKitSchema` (F1-03)
- `coverageThreshold` volta ao `bunfig.toml` quando o Bun deixar de avaliar os arquivos do core importados (known-issues)

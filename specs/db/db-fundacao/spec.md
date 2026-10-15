---
feature: F0-05 db-fundacao
module: db
size: M
status: done
branch: feat/db/db-fundacao
updated: 2026-10-15
---

# F0-05 db-fundacao

## Objetivo
Dar ao `@gizito/db` o schema Drizzle das oito tabelas do MVP, a primeira migration, a conexão e os `test-helpers` com Postgres real, para que F0-06 (fila e transações) e F0-07 (apps) tenham banco onde persistir. Fontes: roadmap §3 F0-05, `docs/engineering/data-model.md` (tabelas, índices, retenção), rule `database.md`, rule `testing.md`, enums e schemas do core (F0-04).

## Requisitos e critérios de aceite
- **RF-01** — `pgEnum` para `order_status`, `grade`, `subject`, `charge_status`, `payment_gateway`, `perceived_difficulty`, `ai_stage`, `notification_channel`, `notification_kind`, `notification_status`, `webhook_source`, `support_ticket_kind`, `support_ticket_status`, com valores vindos dos arrays `*List` do core · Aceite: teste unit compara `enumValues` de cada `pgEnum` com a lista do core.
- **RF-02** — Tabelas `order`, `order_photo`, `charge`, `kit`, `ai_call`, `webhook_event`, `notification`, `support_ticket` conforme `data-model.md` §2: snake_case singular, PK `{tabela}_id` uuid `gen_random_uuid()`, FK com o nome da PK e `onDelete` explícito, `insert_datetime` e `update_datetime` `timestamptz not null default now()`, export Drizzle camelCase singular · Aceite: teste unit varre `getTableConfig` de cada tabela e afirma nome, PK, timestamps e FKs; nenhuma coluna termina em `_at`.
- **RF-03** — Índices de `data-model.md` §3: unique `public_token` e `short_code`; `(status, update_datetime)` e `email` em `order`; `order_id` e `(delete_datetime, insert_datetime)` em `order_photo`; `order_id`, unique parcial `gateway_payment_id` (não nulo) e `(status, expire_datetime)` em `charge`; `order_id` e `(delete_datetime, published_datetime)` em `kit`; `order_id` em `ai_call`; unique `(source, external_id)` em `webhook_event`; unique `(order_id, kind, channel)` em `notification`; `order_id` e `status` em `support_ticket` · Aceite: teste de integração viola cada unique (inclusive duas cobranças com o mesmo `gateway_payment_id` e duas com `NULL`) e lê os índices em `pg_indexes`.
- **RF-04** — Checks de domínio no banco: `amount_cents > 0`; `whatsapp_phone` e `whatsapp_consent_datetime` nulos ou preenchidos juntos; `legibility_score` entre 0 e 1; `width`/`height` e `page_count_*` > 0; `*_token_count`, `cost_cents` e `duration_ms` ≥ 0 · Aceite: teste de integração recebe erro do Postgres em cada violação.
- **RF-05** — `update_datetime` mantido por trigger `BEFORE UPDATE` em toda tabela (função `set_update_datetime()`), definido como SQL customizado na migration · Aceite: teste de integração atualiza uma linha e vê `update_datetime > insert_datetime`; teste unit afirma que a migration tem um `CREATE TRIGGER` por tabela do schema.
- **RF-06** — Migration inicial gerada por `drizzle-kit generate` em `packages/db/drizzle/` (SQL + `meta/`), aplicável do zero por `runMigrations(db)` (migrator do `drizzle-orm/bun-sql`) · Aceite: teste de integração cria banco vazio, migra e encontra as 8 tabelas e os 13 enums; migrar de novo é no-op.
- **RF-07** — Conexão em `client.ts`: `createDatabase({ databaseUrl, maxConnections? })` devolvendo `{ db, close }` sobre `Bun.SQL`, tipos `Database` e `Transaction` exportados; nenhum `process.env` fora do script `migrate.ts` · Aceite: `tsc` verde; grep de `process.env` em `src/` só acha `migrate.ts` e `test-helpers`.
- **RF-08** — `@gizito/db/test-helpers` com `createTestDatabase()` (cria `gizito_test_<hex>` no Postgres de `TEST_DATABASE_URL`, default do compose em `127.0.0.1:5433`, migra, devolve `{ db, databaseName, destroy }`; `destroy` fecha conexões e dropa o banco) e `truncateAllTables(db)` · Aceite: teste de integração: duas chamadas dão bancos distintos; depois de `destroy` o banco não existe em `pg_database`; `truncateAllTables` zera `order` e filhas.
- **RF-09** — Linhas do banco são compatíveis com os schemas do core: um `order` inserido e lido passa em `orderSchema.parse`; `$inferSelect` de `order`, `orderPhoto` e `charge` é atribuível a `Order`, `OrderPhoto` e `Charge` do core (teste de tipo) · Aceite: `tsc` verde e teste de integração com `parse`.
- **RF-10** — Relations Drizzle com coleções `List` (`order.photoList`, `chargeList`, `kitList`, `aiCallList`, `notificationList`, `supportTicketList`; `kit.supersededByKit`) · Aceite: `db.query.order.findFirst({ with: { photoList: true } })` devolve o pedido com as fotos no teste de integração.
- **RF-11** — Scripts: `db:generate` e `db:migrate` no workspace e na raiz via Turborepo (`bun run db:migrate --filter=@gizito/db`); `test` só unit (ignora `integration/`), `test:integration` só integração; raiz ganha `test:integration`; CI sobe o Postgres do compose e roda a integração; cobertura reportada pelo `bunfig.toml` (threshold adiado: ver Decisões e known-issues) · Aceite: `bun run lint`, `typecheck`, `test`, `test:integration` verdes na raiz; `ci.yml` com o step.
- **RF-12** — Docs de estado: roadmap (F0-05 `[x]`, contadores), `docs/progress/db.md`, `docs/README.md`, histórico 1.1 em `data-model.md` com o nome real da migration e o trigger; `.env.example` documenta `TEST_DATABASE_URL` · Aceite: arquivos atualizados com data e spec.

## Fora de escopo
- Tabela da fila, `enqueue`/`work`, `markOrderPaidAndEnqueue`, `publishKit`, `republishKit` (F0-06, ADR-0008).
- `config.ts` das apps lendo `DATABASE_URL` (F0-07); o `db` recebe a URL por parâmetro.
- Jobs de retenção e purge (F2); só as colunas `delete_datetime` e os índices.
- Seeds, admin, backups (F2-13).
- `studyKitSchema` para tipar `kit.study_kit` (F1-03): fica `jsonb` tipado como `unknown`.

## Plano
- **Driver `drizzle-orm/bun-sql`** sobre `Bun.SQL` nativo: zero dependência extra e um só pool por processo. Consequência: `drizzle-kit migrate` não detecta esse driver, então `db:migrate` é `bun run src/migrate.ts` usando `migrate` de `drizzle-orm/bun-sql/migrator`; `drizzle-kit` fica só para `generate` (não precisa de conexão). drizzle-orm 0.45.4 e drizzle-kit 0.31.11 (últimas estáveis em 15/10/2026).
- **Uma migration gerada + SQL customizado**: `drizzle-kit generate --name fundacao` cria `0000_fundacao.sql`; a função `set_update_datetime()` e os triggers são anexados ao mesmo arquivo antes da primeira aplicação (não existe banco aplicado ainda). Numeração nativa do drizzle-kit começa em `0000`; o "0001" do roadmap e do `data-model.md` significa "a primeira", registrado no histórico do doc. Toda tabela nova em migration futura precisa do seu trigger: o teste unit `migrations.test.ts` falha se faltar.
- **`onDelete`**: `restrict` nas FKs para `order` (o pedido é registro contábil permanente; remoção LGPD anonimiza em vez de apagar, `data-model.md` §5) e `set null` em `kit.superseded_by_kit_id`.
- **Tipos**: `jsonb("topic_id_list").$type<TopicId[]>()`, `material_profile` e `study_kit` `jsonb` `unknown`; `cost_cents` `numeric(12,6)` em modo número; `legibility_score` `real`; timestamps `timestamp({ withTimezone: true, mode: "date" })`.
- **Test-helpers**: banco por chamada (não por processo) para isolamento sem `mock.module`; `TEST_DATABASE_URL` separada de `DATABASE_URL` para nunca criar/dropar bancos no servidor da aplicação; nome `gizito_test_` + 12 hex interpolado por `sql.unsafe` porque o nome vem de alfabeto fechado gerado internamente.
- **Separação unit/integração**: `bun test --path-ignore-patterns '**/integration/**'` no `test`; `bun test src/__tests__/integration` no `test:integration` (rule `testing.md`). `bunfig.toml` com `coverageThreshold` 0.7 como no core; `test-helpers/` e `migrate.ts` fora da cobertura unit porque só executam com banco.
- **CI**: step `docker compose up -d --wait postgres` antes de `bun run test:integration` (previsto na spec de F0-02).
- Arquivos: `packages/db/{package.json,drizzle.config.ts,bunfig.toml}`, `src/schema/{enums,timestamps,order,order-photo,charge,kit,ai-call,webhook-event,notification,support-ticket,relations,index}.ts`, `src/{client,migrations,migrate,index}.ts`, `src/test-helpers/index.ts`, `drizzle/0000_fundacao.sql` + `drizzle/meta/`, testes em `src/__tests__/{schema,integration}/`; raiz `package.json`, `turbo.json`, `.github/workflows/ci.yml`, `.env.example`; docs de estado.
- Riscos: `pgEnum` com tupla `readonly` do core → verificar no `tsc`; `numeric({ mode: "number" })` na 0.45.4 → verificar no pacote instalado, senão `doublePrecision`; `drizzle-kit` (roda em Node) resolvendo `#src/*` e `@gizito/core` → verificar na task 2.1; `--path-ignore-patterns` do Bun 1.3.11 → verificar na 3.1.

## Tasks
### M1 — Schema
- [x] 1.1 `drizzle-orm` e `drizzle-kit` no workspace; `drizzle.config.ts`; `schema/enums.ts` e `schema/timestamps.ts` · Verificação: `tsc`
- [x] 1.2 Oito tabelas com índices e checks; `schema/relations.ts`; `schema/index.ts` · Verificação: `tsc`, teste unit de convenções (`__tests__/schema/conventions.test.ts`) e de alinhamento com o core (`core-alignment.test.ts`)
### M2 — Migration, conexão, test-helpers
- [x] 2.1 `drizzle-kit generate --name fundacao`; trigger de `update_datetime` anexado; `migrations.ts` com `MIGRATIONS_FOLDER` e `runMigrations`; teste unit `migrations.test.ts` (journal, um trigger por tabela) · Verificação: `bun test`
- [x] 2.2 `client.ts`, `migrate.ts`, `test-helpers/index.ts`, `index.ts`, `exports` do `package.json` · Verificação: `tsc`
- [x] 2.3 Testes de integração: migração do zero e idempotente, insert e `parse` de pedido, uniques, FKs, checks, trigger, relations, `createTestDatabase`/`destroy`/`truncateAllTables` · Verificação: `bun run test:integration` no workspace
### M3 — Scripts, CI, docs, revisão
- [x] 3.1 Scripts do workspace e da raiz, `turbo.json`, `bunfig.toml`, `ci.yml`, `.env.example` · Verificação: `bun run lint && bun run typecheck && bun run test && bun run test:integration` na raiz
- [x] 3.2 Roadmap, `docs/progress/db.md`, `docs/README.md`, `data-model.md` 1.1, `docs/lessons.md` (bind mount do initdb vira root) · Verificação: leitura
- [x] 3.3 Commits; revisão neutra (`gizito-implement-verifier`); `review.md`; correções

## Decisões
| Data | Decisão | Justificativa |
|---|---|---|
| 2026-10-15 | Driver `drizzle-orm/bun-sql` (Bun.SQL nativo); `db:migrate` por script próprio com o migrator do Drizzle | sem dependência `pg`/`postgres`; `drizzle-kit migrate` não detecta o driver do Bun, mas `generate` não precisa de conexão |
| 2026-10-15 | `update_datetime` por trigger no banco, não por `$onUpdate` do Drizzle | a fila de F0-06 vai usar SQL cru (`FOR UPDATE SKIP LOCKED`); o trigger vale para qualquer escritor. Teste unit exige um trigger por tabela |
| 2026-10-15 | Migration inicial `0000_fundacao` (numeração nativa do drizzle-kit) com o SQL do trigger anexado | não há banco aplicado ainda; o "0001" do roadmap é rótulo humano para "a primeira" |
| 2026-10-15 | `onDelete: "restrict"` nas FKs para `order`; `set null` em `kit.superseded_by_kit_id` | pedido nunca é apagado (registro contábil anonimizado); apagar com filhos deve falhar alto |
| 2026-10-15 | Um banco `gizito_test_<hex>` por `createTestDatabase()`, em `TEST_DATABASE_URL` (default do compose) | isolamento entre arquivos de teste sem `mock.module`; nunca cria/dropa no servidor de `DATABASE_URL` |
| 2026-10-15 | Checks de domínio (`amount_cents > 0`, consentimento junto do telefone, `legibility_score` 0–1) também no banco | o core valida na borda, o banco garante o invariante para qualquer escritor |
| 2026-10-15 | Sem `coverageThreshold` no `db` (só relatório) | o Bun avalia o threshold também sobre os arquivos do core importados e escondidos por `coveragePathIgnorePatterns`; `bun test` saía com 1 com 92% de linhas. Registrado em `known-issues.md` e `lessons.md` |
| 2026-10-15 | Corrigir `publicTokenSchema` do core nesta branch, em commit separado (`66f1217`) | o teste de integração com tokens de `randomBytes(32)` mostrou que `[AQgw]` rejeita 75% dos tokens; a classe canônica tem 16 caracteres (`AEIMQUYcgkosw048`) |
| 2026-10-15 | `db:migrate` e `test:integration` declaram `env` (`DATABASE_URL`, `TEST_DATABASE_URL`) no `turbo.json` | o modo estrito do Turborepo não repassa variáveis não declaradas às tasks |
| 2026-10-15 | `drizzle/meta` fora do Biome | arquivos gerados pelo drizzle-kit; reformatar o snapshot gera ruído no diff |

## Status
Fase: concluída. Revisão neutra APROVADA (rodada 1, `review.md`); o ALERTA e as 5 SUGESTÕES aplicados no commit de fechamento (core 185 testes, db 88 unit + 40 integração, lint e typecheck verdes na raiz). Pendências para o humano: push, PR e merge; ao mesclar, o roadmap (contador da F0) e a linha "Atualizado em" do `docs/README.md` só conflitam se outra feature entrar antes.

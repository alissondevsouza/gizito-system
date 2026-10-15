---
feature: F0-05 db-fundacao
module: db
round: 1
verdict: APROVADO
updated: 2026-10-15
---

# Review: F0-05 db-fundacao

## Rodada 1

Revisor: `gizito-implement-verifier` (spawn novo, só spec + diff `main...HEAD`, commits `66f1217`, `5f2b6a3`, `0616275`).

### Comandos executados
| Comando | Resultado |
|---|---|
| `grep -rn "process.env" packages/db/src/` | só `migrate.ts:7` e `test-helpers/index.ts:24` (RF-07) |
| `cd packages/db && bun run test` | 88 pass, 0 fail, 7 arquivos; `--path-ignore-patterns` confirmado em `bun test --help` |
| `cd packages/db && bun run test:integration` | 32 pass, 0 fail, 6 arquivos, ~1,1 s |
| Bun.SQL em `127.0.0.1:5433` após a suíte | 0 bancos `gizito_test_*` órfãos; 8 triggers `set_update_datetime` no banco `gizito` |
| `git ls-files infra/` | `01-create-evolution-database.sql` versionado (bind mount existe no CI) |
| `bun run lint`, `typecheck`, `test`, `db:generate`, `db:migrate` (raiz) | não repetidos; aceitos do orquestrador (verde, `db:generate` no-op) |
| Leitura de `.env.example` | negada pelo sandbox; diffstat +3 linhas, conteúdo não verificado |

### Critérios de aceite
| RF | Atendido | Evidência (teste ou arquivo) |
|---|---|---|
| RF-01 | sim | `enums.test.ts` compara `enumName`/`enumValues` dos 13 `pgEnum` com as listas do core; `0000_fundacao.sql` cria os 13 tipos |
| RF-02 | sim | `conventions.test.ts` varre `getTableConfig` das 8 tabelas (nome, PK, `_at`, timestamps, FKs com `onDelete`) |
| RF-03 | sim | conjunto exato de índices por tabela em `conventions.test.ts`; violações de unique em `order`, `charge`, `webhook_event`, `notification`; `pg_indexes` com `UNIQUE` + `WHERE (gateway_payment_id IS NOT NULL)` |
| RF-04 | sim | 23514 em `amount_cents` 0/-1, telefone sem consentimento e vice-versa, `legibility_score` 1.5, `width` 0, `page_count_answer_key` 0, `input_token_count` -1 |
| RF-05 | sim | `update_datetime > insert_datetime` após UPDATE; trigger nas 8 tabelas via `information_schema`; `migrations.test.ts` exige um `CREATE TRIGGER` por tabela |
| RF-06 | sim | banco vazio migra para 8 tabelas e 13 enums; `runMigrations` repetido deixa 1 linha em `drizzle.__drizzle_migrations` |
| RF-07 | sim | `createDatabase` → `{ db, close }`; `Database` e `Transaction` exportados; `process.env` só em `migrate.ts` e `test-helpers` |
| RF-08 | sim | bancos distintos por chamada, removidos de `pg_database` após `destroy`, `truncateAllTables` zera `order` e `order_photo`; 0 órfãos |
| RF-09 | sim | `orderSchema.parse(row)` igual à linha; `orderPhotoSchema` e `chargeSchema` passam; `core-alignment.test.ts` prova `$inferSelect → Order/OrderPhoto/Charge` e o inverso no `tsc` |
| RF-10 | sim | `photoList`, `chargeList`, `kitList`, `notificationList`, `supportTicketList`, `kit.supersededByKit` carregados via `db.query`; `relations.test.ts` confere `Many`/`One` |
| RF-11 | sim | scripts no workspace e raiz; `turbo.json` com `env` em `db:migrate` e `test:integration`; `ci.yml` com compose + integração; bunfig sem threshold conforme decisão registrada |
| RF-12 | sim, com pendência | roadmap, progress, README, data-model 1.1, lessons, known-issues conferidos; `.env.example` não verificado (sandbox) |

### Achados
- [ALERTA] `packages/db/src/__tests__/migrations.test.ts:18` — regex do `tag` (`^\d{4}_[a-z0-9-]+$`) rejeita os nomes automáticos do drizzle-kit (`0001_wise_wolverine` tem `_`) — toda migration futura só passaria se gerada com `--name` em kebab-case, exigência não documentada — aceitar `_` na classe ou documentar
- [SUGESTÃO] `packages/db/src/schema/charge.ts:25` — `refund_datetime` existe no banco e no data-model, mas `chargeSchema` do core não tem `refundDatetime`; o alinhamento passa só porque TS tolera propriedade extra e Zod descarta chave desconhecida — acrescentar `refundDatetime: z.date().nullable()` ao core
- [SUGESTÃO] `order.test.ts:140`, `kit-and-ai-call.test.ts:57`, `kit-and-ai-call.test.ts:100` — CHECKs compostas exercitadas por uma coluna só (`height`, `page_count_activities`, `output_token_count`, `cost_cents`, `duration_ms`, `legibility_score < 0` nunca violados) — um `it.each` por coluna fecha a lacuna
- [SUGESTÃO] `packages/core/src/__tests__/order/schemas.test.ts:16-23` — a lição pede testar com `randomBytes(32).toString("base64url")`, mas o teste do core continua com fixture fixa — acrescentar laço com N tokens gerados no core
- [SUGESTÃO] `packages/db/tsconfig.json:4` — `include: ["src"]` deixa `drizzle.config.ts` fora do `tsc`
- [SUGESTÃO] `conventions.test.ts:17` e `integration/migration.test.ts:57` — lista de 16 índices duplicada entre unit e integração — derivar a da integração de `getTableConfig(table).indexes`

### Regressão pedagógica
Não aplicável: nenhum prompt, modelo, taxonomia ou validador tocado.

### Resposta do orquestrador
Veredito aceito. Tudo aplicado no commit de fechamento:
- ALERTA (tag da migration): a classe do `tag` aceita `_` (`^\d{4}_[a-z0-9_-]+$`), então os nomes automáticos do drizzle-kit passam; nenhuma regra nova a documentar.
- `refundDatetime: z.date().nullable()` em `chargeSchema` do core e na fixture `buildCharge`; linha lida de `charge` deixa de perder o campo ao passar pelo core. `docs/progress/core.md` anotado.
- CHECKs compostas exercitadas coluna a coluna com `it.each` (`width`, `height`, `legibility_score` < 0 e > 1; `page_count_activities` e `page_count_answer_key`; os quatro campos de `ai_call`): integração passa de 32 para 40 testes; `buildAiCallInsert` nos helpers.
- Teste do core com 256 tokens de `randomBytes(32).toString("base64url")` (185 testes, cobertura 100%).
- `drizzle.config.ts` no `include` do `tsconfig.json` do db; `tsc` verde.
- Lista de índices da integração derivada de `getTableConfig(table).indexes` (16), com as asserções de `UNIQUE` e `WHERE` mantidas.
- `.env.example` (não verificado pelo revisor por bloqueio do sandbox): +3 linhas de comentário e `# TEST_DATABASE_URL=...` comentado, sem credenciais.

Revalidação: `bun run lint`, `typecheck`, `test` (core 185, db 88) e `test:integration` (db 40) verdes na raiz. Sem CRÍTICO, sem rerodada.
